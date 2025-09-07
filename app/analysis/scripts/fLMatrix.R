#!/usr/bin/env Rscript

# CFA/SEM analysis script using lavaan. Accepts:
#   Rscript custom_analysis.R <data_json> <model_txt> <output_json>
# - If model_txt is empty: only descriptive stats are returned.
# - If model_txt is provided: runs SEM/CFA and returns Step-6 diagnostics (purification, reliability,
#   per-item/subdimension checks), plus Fornell–Larcker (classical matrix) and HTMT.

# Ensure user library path (non-root installs)
user_lib <- file.path(Sys.getenv("HOME"), "R", "libs")
if (!dir.exists(user_lib)) dir.create(user_lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(user_lib, .libPaths()))

quiet_pkg <- function(pkg) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    install.packages(pkg, repos = "https://cloud.r-project.org", lib = user_lib)
  }
  suppressPackageStartupMessages(library(pkg, character.only = TRUE))
}

quiet_pkg("jsonlite")   # always

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) stop("Expected three arguments: <data_json> <model_txt> <output_json>")
data_path  <- args[1]
model_path <- args[2]
output_path <- args[3]

safe_read_json <- function(path) {
  if (!file.exists(path)) return(list())
  txt <- readLines(path, warn = FALSE)
  if (!length(txt)) return(list())
  jsonlite::fromJSON(paste(txt, collapse = "\n"))
}
safe_read_text <- function(path) {
  if (!file.exists(path)) return("")
  paste(readLines(path, warn = FALSE), collapse = "\n")
}

data_list <- safe_read_json(data_path)
df <- tryCatch({ as.data.frame(data_list, stringsAsFactors = FALSE) }, error = function(e) data.frame())
model_syntax <- safe_read_text(model_path)

# Clean model syntax (remove comments/empties)
if (nchar(model_syntax) > 0) {
  lines <- unlist(strsplit(model_syntax, "\n", fixed = TRUE))
  lines <- gsub("\r", "", lines, fixed = TRUE)
  # normalize curly quotes: ‘ ’ “ ” -> ' ' " "
  lines <- chartr('‘’“”', '\'\'""', lines)
  # strip comments
  lines <- sub("#.*$", "", lines)
  lines <- trimws(lines)
  lines <- lines[nzchar(lines)]
  cleaned_model_syntax <- paste(lines, collapse = "\n")
} else {
  cleaned_model_syntax <- model_syntax
}

numeric_cols <- names(df)[vapply(df, is.numeric, logical(1))]
column_means <- if (length(numeric_cols)) {
  m <- vapply(df[numeric_cols], function(x) mean(x, na.rm = TRUE), numeric(1))
  as.list(m)
} else list()

result <- list(
  status = "ok",
  n_rows = nrow(df),
  n_cols = ncol(df),
  numeric_columns = numeric_cols,
  column_means = column_means,
  model_provided = nchar(trimws(model_syntax)) > 0
)

# ---------- Step 6 helper: purification + reliability + item/subdim + discriminant validity ----------
# Thresholds: AVE >= .50, CR >= .70; MI > 3.84; VIF pref < 3 (tolerate < 10).
step6_auto_report <- function(fit, dat, loading_cut = .50, mi_cut = 3.84, vif_pref = 3, vif_cut = 10) {
  stopifnot(inherits(fit, "lavaan"))
  ss <- lavaan::standardizedSolution(fit)
  pe <- lavaan::parameterEstimates(fit, standardized = TRUE)
  mi <- lavaan::modificationIndices(fit)
  ov <- lavaan::lavNames(fit, type = "ov")
  lv <- lavaan::lavNames(fit, type = "lv")

  scores <- tryCatch(as.data.frame(lavaan::lavPredict(fit, type = "lv")), error = function(e) NULL)

  # Identify blocks
  refl_items <- subset(ss, op == "=~" & lhs %in% lv & rhs %in% ov)   # first-order reflective items
  refl_first_order <- unique(refl_items$lhs)

  so_paths <- subset(ss, op == "=~" & lhs %in% lv & rhs %in% lv)     # second-order reflective
  so_reflective <- unique(so_paths$lhs)
  so_children   <- if (nrow(so_paths)) split(so_paths$rhs, so_paths$lhs) else list()

  # recognize both "~" and "<~" for formative
  form_ops  <- c("~", "<~")
  form_rows <- subset(pe, op %in% form_ops & lhs %in% lv)

  first_form <- second_form <- character(0)
  if (nrow(form_rows)) {
    by_latent <- split(form_rows, form_rows$lhs)
    for (LHS in names(by_latent)) {
      RHS <- by_latent[[LHS]]$rhs
      if (all(RHS %in% ov)) first_form <- c(first_form, LHS)         # first-order formative (latent ~ indicators)
      if (all(RHS %in% lv)) second_form <- c(second_form, LHS)       # second-order formative (latent ~ subdims)
    }
    first_form  <- unique(first_form)
    second_form <- unique(second_form)
  }

  # Helpers
  item_err_var <- function(item) {
    v <- subset(pe, op == "~~" & lhs == item & rhs == item)$std.all
    if (length(v)) v[1] else NA_real_
  }
  ave_cr_one <- function(f, items) {
    L <- subset(ss, op == "=~" & lhs == f & rhs %in% items)
    if (!nrow(L)) return(data.frame(factor = f, AVE = NA_real_, CR = NA_real_))
    lam <- L$est.std
    theta <- sapply(L$rhs, item_err_var)
    AVE <- mean(lam^2)
    CR  <- (sum(lam))^2 / ((sum(lam))^2 + sum(theta))
    data.frame(factor = f, AVE = AVE, CR = CR)
  }
  safe_vif_vec <- function(model) {
    out <- tryCatch({
      mm <- model.matrix(model)
      if (ncol(mm) <= 2) return(NA)  # intercept + 1 predictor
      car::vif(model)
    }, error = function(e) NA)
    out
  }

  # Global fit
  global_fit <- data.frame(
    chisq = lavaan::fitMeasures(fit, "chisq"),
    df    = lavaan::fitMeasures(fit, "df"),
    p     = lavaan::fitMeasures(fit, "pvalue"),
    cfi   = lavaan::fitMeasures(fit, "cfi"),
    tli   = lavaan::fitMeasures(fit, "tli"),
    rmsea = lavaan::fitMeasures(fit, "rmsea"),
    srmr  = lavaan::fitMeasures(fit, "srmr")
  )

  # First-order reflective: AVE/CR
  refl_constructs <- if (length(refl_first_order)) {
    do.call(rbind, lapply(refl_first_order, function(f) {
      items <- subset(refl_items, lhs == f)$rhs
      ave_cr_one(f, items)
    }))
  } else data.frame()

  # Item-level diagnostics (z, lambda^2)
  L_pe <- subset(pe, op == "=~", select = c("lhs","rhs","std.all","z","pvalue"))
  refl_items_df <- if (nrow(L_pe)) {
    out <- transform(L_pe, lambda2 = std.all^2)
    names(out)[1:2] <- c("factor","item")
    out$flag_weak <- (!is.finite(out$z) | out$z <= 1.96 | out$lambda2 < loading_cut)
    out
  } else data.frame()

  # Error-covariance MIs and cross-loading MIs
  errcov_MIs <- if (length(refl_first_order)) {
    do.call(rbind, lapply(refl_first_order, function(f) {
      items <- subset(refl_items, lhs == f)$rhs
      subset(mi, op == "~~" & lhs %in% items & rhs %in% items & mi > mi_cut)
    }))
  } else data.frame()
  if (nrow(errcov_MIs)) errcov_MIs <- errcov_MIs[order(-errcov_MIs$mi), ]

  xload_MIs <- if (length(refl_first_order)) {
    do.call(rbind, lapply(refl_first_order, function(f) {
      items <- subset(refl_items, lhs == f)$rhs
      subset(mi, op == "=~" & rhs %in% items & lhs != f & mi > mi_cut)
    }))
  } else data.frame()
  if (nrow(xload_MIs)) xload_MIs <- xload_MIs[order(-xload_MIs$mi), ]

  # 3) Reliability at the construct level
  reflective_alpha <- data.frame()
  if (length(refl_first_order)) {
    quiet_pkg("psych")
    reflective_alpha <- do.call(rbind, lapply(refl_first_order, function(f) {
      items <- subset(refl_items, lhs == f)$rhs
      items <- intersect(items, colnames(dat))
      X <- dat[, items, drop = FALSE]
      if (ncol(X)) {
        is_num <- vapply(X, is.numeric, logical(1))
        X <- X[, is_num, drop = FALSE]
      }
      if (!ncol(X) || ncol(X) < 2) {
        data.frame(factor = f, n_items = length(items), alpha_raw = NA_real_, alpha_std = NA_real_)
      } else {
        X <- X[rowSums(is.na(X)) < ncol(X), , drop = FALSE]
        a <- tryCatch(psych::alpha(X, warnings = FALSE), error = function(e) NULL)
        if (is.null(a)) {
          data.frame(factor = f, n_items = ncol(X), alpha_raw = NA_real_, alpha_std = NA_real_)
        } else {
          data.frame(factor = f, n_items = ncol(X),
                     alpha_raw = unname(a$total$raw_alpha),
                     alpha_std = unname(a$total$std.alpha))
        }
      }
    }))
  }

  second_order_reflective_CR <- data.frame()
  if (length(so_reflective)) {
    second_order_reflective_CR <- do.call(rbind, lapply(so_reflective, function(s2) {
      kids <- so_children[[s2]]
      L <- subset(ss, op == "=~" & lhs == s2 & rhs %in% kids)
      if (!nrow(L)) {
        data.frame(second_order = s2, CR_2nd = NA_real_)
      } else {
        lambda <- L$est.std
        subs <- L$rhs
        theta <- sapply(subs, function(s)
          subset(pe, op == "~~" & lhs == s & rhs == s)$std.all)
        CR2 <- (sum(lambda))^2 / ((sum(lambda))^2 + sum(theta))
        data.frame(second_order = s2, CR_2nd = CR2)
      }
    }))
  }

  # 2B) First-order formative diagnostics
  form1_table <- data.frame()
  formative_weights <- data.frame()
  formative_vif_detail <- data.frame()
  if (length(first_form)) {
    quiet_pkg("car")
    form1_table <- do.call(rbind, lapply(first_form, function(f) {
      rhs <- subset(pe, op %in% form_ops & lhs == f)$rhs
      rhs <- intersect(rhs, colnames(dat))
      X   <- dat[, rhs, drop = FALSE]
      if (ncol(X)) X <- X[, vapply(X, is.numeric, logical(1)), drop = FALSE]

      # R^2_a uses latent scores if available
      r2a <- tryCatch({
        if (!is.null(scores) && f %in% colnames(scores) && ncol(X))
          mean(cor(scores[[f]], X, use = "pairwise.complete.obs")^2)
        else NA_real_
      }, error = function(e) NA_real_)

      # VIF among formative indicators (does not need scores)
      vif_val <- tryCatch({
        if (ncol(X) >= 2) {
          y_dummy <- rowMeans(X, na.rm = TRUE)
          car::vif(lm(y_dummy ~ ., data = X))
        } else NA
      }, error = function(e) NA)

      data.frame(
        factor = f,
        R2a = r2a,
        VIF_max = if (is.numeric(vif_val)) max(vif_val, na.rm = TRUE) else NA_real_,
        VIF_pref_pass = if (is.numeric(vif_val)) all(vif_val < vif_pref) else NA,
        VIF_10_pass   = if (is.numeric(vif_val)) all(vif_val < vif_cut) else NA,
        n_indicators  = ncol(X)
      )
    }))

    # per-indicator formative weights (std, z)
    fw <- subset(pe, op %in% form_ops & lhs %in% first_form & rhs %in% ov,
                 select = c("lhs","rhs","std.all","z","pvalue"))
    if (nrow(fw)) {
      names(fw)[1:2] <- c("factor","indicator")
      fw$nonsignificant <- (!is.finite(fw$z) | fw$z <= 1.96)
      formative_weights <- fw
    }

    # detailed VIF per indicator
    vifs_detailed <- do.call(rbind, lapply(first_form, function(f) {
      rhs <- subset(pe, op %in% form_ops & lhs == f)$rhs
      rhs <- intersect(rhs, colnames(dat))
      X   <- dat[, rhs, drop = FALSE]
      if (ncol(X)) X <- X[, vapply(X, is.numeric, logical(1)), drop = FALSE]
      if (ncol(X) < 2) return(NULL)
      model <- tryCatch(lm(rowMeans(X, na.rm = TRUE) ~ ., data = X), error = function(e) NULL)
      if (is.null(model)) return(NULL)
      v <- tryCatch(safe_vif_vec(model), error = function(e) NA)
      if (all(is.na(v))) return(NULL)
      data.frame(factor = f, indicator = names(v), VIF = as.numeric(v), row.names = NULL)
    }))
    if (!is.null(vifs_detailed) && nrow(vifs_detailed)) formative_vif_detail <- vifs_detailed
  }

  # 2C) Second-order reflective diagnostics
  so_reflect_table <- data.frame()
  second_order_reflective_loadings <- data.frame()
  if (length(so_reflective)) {
    so_reflect_table <- do.call(rbind, lapply(so_reflective, function(s2) {
      kids <- so_children[[s2]]
      L <- subset(ss, op == "=~" & lhs == s2 & rhs %in% kids, select = c(rhs, est.std))
      ave2 <- if (nrow(L)) mean(L$est.std^2) else NA_real_
      minl <- if (nrow(L)) min(L$est.std) else NA_real_
      data.frame(second_order = s2,
                 n_first_order = length(kids),
                 AVE_2nd = ave2,
                 min_loading = minl,
                 min_loading_sq = minl^2)
    }))
    L2 <- subset(pe, op == "=~" & lhs %in% so_reflective & rhs %in% lv, select = c("lhs","rhs","std.all","z","pvalue"))
    if (nrow(L2)) {
      names(L2)[1:2] <- c("second_order","subdimension")
      L2$lambda2 <- L2$std.all^2
      second_order_reflective_loadings <- L2
    }
  }

  # 2D) Second-order formative diagnostics (needs latent scores)
  so_form_table <- data.frame()
  second_order_formative_weights <- data.frame()
  second_order_formative_vif_detail <- data.frame()
  second_order_formative_unique_R2 <- data.frame()
  if (length(second_form) && !is.null(scores)) {
    quiet_pkg("car"); quiet_pkg("relaimpo")
    so_form_table <- do.call(rbind, lapply(second_form, function(s2) {
      preds <- subset(pe, op %in% form_ops & lhs == s2)$rhs
      r2a <- tryCatch(mean(cor(scores[[s2]], scores[, preds, drop = FALSE],
                               use = "pairwise.complete.obs")^2), error = function(e) NA_real_)
      model <- lm(scores[[s2]] ~ ., data = scores[, preds, drop = FALSE])
      vifs <- tryCatch(safe_vif_vec(model), error = function(e) NA)
      VIF_max <- if (is.numeric(vifs)) max(vifs, na.rm = TRUE) else NA_real_
      data.frame(second_order = s2,
                 R2a = r2a,
                 VIF_max = VIF_max,
                 VIF_pref_pass = if (is.numeric(vifs)) all(vifs < vif_pref) else NA,
                 VIF_10_pass   = if (is.numeric(vifs)) all(vifs < 10) else NA,
                 n_subdims = length(preds))
    }))
    sw <- subset(pe, op %in% form_ops & lhs %in% second_form & rhs %in% lv,
                 select = c("lhs","rhs","std.all","z","pvalue"))
    if (nrow(sw)) {
      names(sw)[1:2] <- c("second_order","subdimension")
      sw$nonsignificant <- (!is.finite(sw$z) | sw$z <= 1.96)
      second_order_formative_weights <- sw
    }
    vifs2 <- do.call(rbind, lapply(second_form, function(s2) {
      preds <- subset(pe, op %in% form_ops & lhs == s2)$rhs
      model <- tryCatch(lm(scores[[s2]] ~ ., data = scores[, preds, drop = FALSE]), error = function(e) NULL)
      if (is.null(model)) return(NULL)
      v <- tryCatch(safe_vif_vec(model), error = function(e) NA)
      if (all(is.na(v))) return(NULL)
      data.frame(second_order = s2, subdimension = names(v), VIF = as.numeric(v), row.names = NULL)
    }))
    if (!is.null(vifs2) && nrow(vifs2)) second_order_formative_vif_detail <- vifs2

    lmg_rows <- do.call(rbind, lapply(second_form, function(s2) {
      preds <- subset(pe, op %in% form_ops & lhs == s2)$rhs
      mod <- tryCatch(lm(scores[[s2]] ~ ., data = scores[, preds, drop = FALSE]), error = function(e) NULL)
      if (is.null(mod)) return(NULL)
      rel <- tryCatch(relaimpo::calc.relimp(mod, type = "lmg"), error = function(e) NULL)
      if (is.null(rel)) return(NULL)
      data.frame(second_order = s2, subdimension = rownames(rel$lmg), lmg = as.numeric(rel$lmg), row.names = NULL)
    }))
    if (!is.null(lmg_rows) && nrow(lmg_rows)) second_order_formative_unique_R2 <- lmg_rows
  }

  # Discriminant validity: Fornell–Larcker (classical matrix) + HTMT
  fl_table <- NULL
  htmt_vals <- NULL
  if (length(refl_first_order) >= 2) {
    AVE <- setNames(refl_constructs$AVE, refl_constructs$factor)
    LatCor <- tryCatch(lavaan::lavInspect(fit, "cor.lv"), error = function(e) NULL)
    if (!is.null(LatCor)) {
      targets <- intersect(refl_first_order, rownames(LatCor))
      if (length(targets) >= 2) {
        M <- LatCor[targets, targets, drop = FALSE]
        diag(M) <- sqrt(AVE[targets])  # classical FL: diag = sqrt(AVE)
        # labeled table for JSON (keeps row/col names)
        fl_table <- data.frame(construct = rownames(M),
                               as.data.frame(M, check.names = FALSE),
                               row.names = NULL)
      }
    }
    quiet_pkg("semTools")
    htmt_vals <- tryCatch(semTools::htmt(fit), error = function(e) NULL)
  }

  flags <- list(
    reflective_constructs_fail_AVE = subset(refl_constructs, AVE < .50),
    reflective_constructs_fail_CR  = subset(refl_constructs, CR  < .70),
    reflective_items_weak          = subset(refl_items_df, flag_weak),
    error_covariance_MIs           = errcov_MIs,
    cross_loading_MIs              = xload_MIs,
    second_order_reflective_weak   = if (nrow(so_reflect_table)) subset(so_reflect_table, AVE_2nd < .50 | min_loading_sq < .50) else data.frame(),
    formative_first_VIF_issues     = if (nrow(form1_table)) subset(form1_table, is.na(VIF_10_pass) | !VIF_10_pass) else data.frame(),
    second_order_form_VIF_issues   = if (nrow(so_form_table)) subset(so_form_table, is.na(VIF_10_pass) | !VIF_10_pass) else data.frame()
  )

  list(
    global_fit = global_fit,
    reflective_constructs = refl_constructs,                  # AVE, CR
    reflective_items = refl_items_df,                         # per-item λ, z, λ²
    reliability = list(
      reflective_alpha = reflective_alpha,                    # Cronbach's alpha per 1st-order reflective factor
      second_order_reflective_CR = second_order_reflective_CR # CR for 2nd-order reflective
    ),
    formative_first_order = form1_table,                      # R^2_a + VIF summary
    formative_weights = formative_weights,                    # per-indicator weights (std, z)
    formative_vif_detail = formative_vif_detail,              # per-indicator VIFs
    second_order_reflective = so_reflect_table,               # AVE_2nd + min loading
    second_order_reflective_loadings = second_order_reflective_loadings,
    second_order_formative = so_form_table,                   # R^2_a + VIF summary
    second_order_formative_weights = second_order_formative_weights,
    second_order_formative_vif_detail = second_order_formative_vif_detail,
    second_order_formative_unique_R2 = second_order_formative_unique_R2,
    discriminant_validity = list(
      fornell_larcker = fl_table,   # CLASSICAL MATRIX ONLY
      htmt = htmt_vals              # optional; common threshold < .85
    ),
    flags = flags
  )
}
# ---------------- end Step 6 helper ----------------

if (result$model_provided) {
  quiet_pkg("lavaan")
  cfa_out <- tryCatch(
    withCallingHandlers({
      # Use sem() so formative (~ or <~) is allowed; works for pure CFA too
      fit <- lavaan::sem(cleaned_model_syntax, data = df, std.lv = FALSE)

      fm <- lavaan::fitMeasures(fit, c("chisq","df","pvalue","cfi","tli","rmsea","srmr"))
      pe <- lavaan::parameterEstimates(fit, standardized = TRUE)
      loadings <- subset(pe, op == "=~", select = c("lhs","rhs","est","std.all"))

      # Step 6 metrics + reliability + item/subdimension evaluation
      step6 <- step6_auto_report(fit, df)

      list(
        fit_measures = as.list(fm),
        loadings = lapply(seq_len(nrow(loadings)), function(i) {
          list(latent = loadings$lhs[i],
               indicator = loadings$rhs[i],
               estimate = loadings$est[i],
               std_all = loadings$std.all[i])
        }),
        step6 = step6
      )
    },
    warning = function(w) {
      if (is.null(result$warning)) result$warning <<- conditionMessage(w)
      invokeRestart("muffleWarning")  # valid here (withCallingHandlers)
    }),
    error = function(e) {
      result$status <<- "cfa_error"
      list(error = conditionMessage(e))
    }
  )
  result <- c(result, cfa_out)
}

jsonlite::write_json(result, output_path, auto_unbox = TRUE, pretty = FALSE,
                     dataframe = "rows", null = "null")
invisible(NULL)
