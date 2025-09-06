#!/usr/bin/env Rscript

# Exploratory Factor Analysis (EFA) script
# Usage:
#   Rscript efa_analysis.R <data_json> <output_json> [n_factors|auto] [rotation]
# Args:
#   data_json   : JSON file with a record-list of numeric item columns (same shape as CFA input)
#   output_json : Where to write JSON results
#   n_factors   : (optional) integer >0 or 'auto' (default 'auto')
#   rotation    : (optional) 'varimax' (orthogonal), 'promax'/'oblimin' (oblique). Default 'oblimin'

# ---------- bootstrap user lib ----------
user_lib <- file.path(Sys.getenv("HOME"), "R", "libs")
if (!dir.exists(user_lib)) dir.create(user_lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(user_lib, .libPaths()))
quiet_pkg <- function(pkg){
  if (!requireNamespace(pkg, quietly = TRUE)) {
    install.packages(pkg, repos = "https://cloud.r-project.org", lib = user_lib)
  }
  suppressPackageStartupMessages(library(pkg, character.only = TRUE))
}

quiet_pkg("jsonlite")

# ---------- CLI ----------
# Two supported invocation styles:
#  A) Legacy / direct: Rscript efa_analysis.R data.json output.json [n_factors] [rotation]
#  B) Via generic runner: Rscript efa_analysis.R data.json model.txt output.json [n_factors] [rotation]
# We detect pattern B when the second argument is NOT a .json but the third IS (output path).
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript efa_analysis.R <data_json> <output_json> [n_factors|auto] [rotation] OR with model placeholder: <data_json> <model.txt> <output_json> [n_factors|auto] [rotation]")
}

use_model_placeholder <- FALSE
if (length(args) >= 3) {
  arg2_is_json <- grepl("\\.json$", args[2], ignore.case = TRUE)
  arg3_is_json <- grepl("\\.json$", args[3], ignore.case = TRUE)
  # pattern B: second not json, third is json
  if (!arg2_is_json && arg3_is_json) {
    use_model_placeholder <- TRUE
  }
}

if (use_model_placeholder) {
  data_path <- args[1]
  # model_path <- args[2]  # currently unused for pure EFA
  out_path  <- args[3]
  idx <- 4
} else {
  data_path <- args[1]
  out_path  <- args[2]
  idx <- 3
}

req_n    <- if (length(args) >= idx) args[idx] else "auto"
rotation <- if (length(args) >= (idx + 1)) args[idx + 1] else "oblimin"
if (!rotation %in% c("varimax","promax","oblimin")) rotation <- "oblimin"

# ---------- IO helpers ----------
safe_read_json <- function(path){
  if (!file.exists(path)) return(list())
  txt <- readLines(path, warn = FALSE)
  if (!length(txt)) return(list())
  jsonlite::fromJSON(paste(txt, collapse = "\n"))
}

raw <- safe_read_json(data_path)
df  <- tryCatch(as.data.frame(raw, stringsAsFactors = FALSE), error = function(e) data.frame())

numeric_cols <- names(df)[vapply(df, is.numeric, logical(1))]
res <- list(status = "ok", n_rows = nrow(df), n_cols = ncol(df), numeric_columns = numeric_cols)

# ---------- basic guards ----------
if (length(numeric_cols) < 2 || nrow(df) < 3) {
  res$status <- "no_data"
  res$message <- "Need at least 2 numeric columns and 3 rows."
  jsonlite::write_json(res, out_path, auto_unbox = TRUE, pretty = FALSE)
  quit(save = "no", status = 0)
}

quiet_pkg("psych")
if (rotation %in% c("oblimin","promax")) quiet_pkg("GPArotation")

# Work matrix: drop all-NA rows; drop zero-variance columns
X <- df[, numeric_cols, drop = FALSE]
X <- X[rowSums(!is.na(X)) > 0, , drop = FALSE]
if (!nrow(X)) {
  res$status <- "no_data"
  res$message <- "All rows are NA across numeric columns."
  jsonlite::write_json(res, out_path, auto_unbox = TRUE, pretty = FALSE)
  quit(save = "no", status = 0)
}
var_ok <- vapply(X, function(v) stats::var(v, na.rm = TRUE) > 0, logical(1))
X <- X[, var_ok, drop = FALSE]
if (ncol(X) < 2) {
  res$status <- "no_data"
  res$message <- "All but one numeric column had zero variance."
  jsonlite::write_json(res, out_path, auto_unbox = TRUE, pretty = FALSE)
  quit(save = "no", status = 0)
}

# ---------- correlation + eigen ----------
R <- tryCatch(stats::cor(X, use = "pairwise.complete.obs"), error = function(e) NULL)
if (is.null(R)) {
  res$status <- "cor_error"
  res$message <- "Correlation matrix could not be computed."
  jsonlite::write_json(res, out_path, auto_unbox = TRUE, pretty = FALSE)
  quit(save = "no", status = 0)
}
eigen_values <- tryCatch(eigen(R, only.values = TRUE, symmetric = TRUE)$values, error = function(e) numeric())

# ---------- choose number of factors ----------
get_nfact_from_parallel <- function(pa, ev){
  if (is.null(pa)) return(NA_integer_)
  # psych versions differ:
  if (!is.null(pa$nfact))    return(as.integer(pa$nfact))
  if (!is.null(pa$nfactors)) return(as.integer(pa$nfactors))
  if (!is.null(pa$fa) && length(pa$fa) == length(ev)) {
    return(max(1L, sum(ev > pa$fa)))
  }
  NA_integer_
}

suggested_parallel <- NA_integer_
user_specified     <- NA_integer_
eigen_gt1          <- max(1L, sum(eigen_values > 1))

if (identical(req_n, "auto")) {
  pa <- tryCatch(psych::fa.parallel(X, fa = "fa", fm = "minres", show.legend = FALSE, plot = FALSE),
                 error = function(e) NULL)
  suggested_parallel <- get_nfact_from_parallel(pa, eigen_values)
} else {
  user_specified <- suppressWarnings(as.integer(req_n))
  if (is.na(user_specified) || user_specified < 1) user_specified <- NA_integer_
}

k_raw <- if (!is.na(user_specified)) user_specified else if (!is.na(suggested_parallel)) suggested_parallel else eigen_gt1
k <- max(1L, min(k_raw, ncol(X) - 1L))

# ---------- run EFA ----------
fm_method <- "pa"  # principal axis
rot_method <- rotation
efa_fit <- tryCatch(psych::fa(X, nfactors = k, fm = fm_method, rotate = rot_method),
                    error = function(e) NULL)

if (is.null(efa_fit)) {
  res$status <- "efa_error"
  res$message <- "EFA failed to converge or incompatible arguments."
  jsonlite::write_json(res, out_path, auto_unbox = TRUE, pretty = FALSE)
  quit(save = "no", status = 0)
}

# ---------- tidy outputs ----------
# Loadings matrix with item column first
load_mat <- as.data.frame(unclass(efa_fit$loadings))
if (is.null(colnames(load_mat)) || any(colnames(load_mat) == "")) {
  colnames(load_mat) <- paste0("F", seq_len(ncol(load_mat)))
}
load_mat$item <- rownames(load_mat)
rownames(load_mat) <- NULL
# reorder to item first
load_mat <- load_mat[, c("item", setdiff(colnames(load_mat), "item")), drop = FALSE]

# Long-form loadings
loading_long <- do.call(rbind, lapply(seq_len(nrow(load_mat)), function(i){
  item <- load_mat$item[i]
  vals <- load_mat[i, setdiff(colnames(load_mat), "item"), drop = FALSE]
  do.call(rbind, lapply(seq_len(ncol(vals)), function(j){
    data.frame(item = item, factor = colnames(vals)[j], loading = unname(vals[1, j]), stringsAsFactors = FALSE)
  }))
}))

# Communalities/uniquenesses (robust to rotation)
Lmat <- as.matrix(load_mat[, setdiff(colnames(load_mat), "item"), drop = FALSE])
Phi <- if (!is.null(efa_fit$Phi)) as.matrix(efa_fit$Phi) else diag(ncol(Lmat))
h2_calc <- as.numeric(diag(Lmat %*% Phi %*% t(Lmat)))
names(h2_calc) <- load_mat$item
u2_given <- tryCatch(efa_fit$uniquenesses, error = function(e) NULL)
if (!is.null(u2_given) && length(u2_given) == length(h2_calc)) {
  u2 <- as.numeric(u2_given); names(u2) <- names(u2_given)
} else {
  u2 <- 1 - h2_calc
}

# Variance accounted (safe)
variance <- NULL
if (!is.null(efa_fit$Vaccounted)) {
  va <- efa_fit$Vaccounted
  # Ensure it has the expected rows; otherwise compute SS loadings directly
  have_rows <- all(c("SS loadings","Proportion Var","Cumulative Var") %in% rownames(va))
  if (have_rows) {
    variance <- data.frame(
      factor = colnames(Lmat),
      SS_loadings = as.numeric(va["SS loadings", seq_len(ncol(Lmat))]),
      Proportion  = as.numeric(va["Proportion Var", seq_len(ncol(Lmat))]),
      Cumulative  = as.numeric(va["Cumulative Var", seq_len(ncol(Lmat))]),
      row.names = NULL
    )
  }
}
if (is.null(variance)) {
  ss <- colSums(Lmat^2)
  prop <- ss / ncol(X)
  cum  <- cumsum(prop)
  variance <- data.frame(
    factor = colnames(Lmat),
    SS_loadings = as.numeric(ss),
    Proportion  = as.numeric(prop),
    Cumulative  = as.numeric(cum),
    row.names = NULL
  )
}

# Factor correlations (only for oblique rotations)
Phi_df <- if (!is.null(efa_fit$Phi)) {
  # align names to factor columns we emitted
  dimnames(Phi) <- list(colnames(Lmat), colnames(Lmat))
  as.data.frame(Phi)
} else NULL

# ---------- assemble JSON ----------
res$efa <- list(
  n_factors_selected = k,
  criteria = list(parallel_suggested = suggested_parallel, eigen_gt1 = sum(eigen_values > 1), user_specified = user_specified),
  eigenvalues = eigen_values,
  loadings = loading_long,
  loadings_matrix = load_mat,
  communalities = as.list(h2_calc),
  uniquenesses = as.list(u2),
  variance = variance,
  factor_correlation = Phi_df
)

jsonlite::write_json(res, out_path, auto_unbox = TRUE, pretty = FALSE, dataframe = "rows", null = "null")
invisible(NULL)
