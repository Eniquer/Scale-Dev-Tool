#!/usr/bin/env Rscript

# CFA analysis script using lavaan. Accepts:
#   Rscript custom_analysis.R <data_json> <model_txt> <output_json>
# data_json : JSON array of records (datatable)
# model_txt : text file containing lavaan model syntax (can be empty). If empty, only descriptive stats returned.
# output_json: path to write JSON results.

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

quiet_pkg("jsonlite")
# lavaan only needed if model provided

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
	stop("Expected three arguments: <data_json> <model_txt> <output_json>")
}
data_path  <- args[1]
model_path <- args[2]
output_path <- args[3]

safe_read_json <- function(path) {
	if (!file.exists(path)) return(list())
	txt <- readLines(path, warn = FALSE)
	if (!length(txt)) return(list())
	fromJSON(paste(txt, collapse = "\n"))
}

safe_read_text <- function(path) {
	if (!file.exists(path)) return("")
	paste(readLines(path, warn = FALSE), collapse = "\n")
}

data_list <- safe_read_json(data_path)
df <- tryCatch({ as.data.frame(data_list, stringsAsFactors = FALSE) }, error = function(e) data.frame())
model_syntax <- safe_read_text(model_path)

# --- Clean model syntax: remove comments and blank lines to avoid lavaan block parsing issues ---
if (nchar(model_syntax) > 0) {
	lines <- unlist(strsplit(model_syntax, "\n", fixed = TRUE))
	# Normalize carriage returns, strip inline comments (# ...), trim whitespace
	lines <- gsub("\r", "", lines, fixed = TRUE)
	# Remove UTF smart quotes just in case
	lines <- chartr('“”’', '"""', lines)
	# Strip everything from first unescaped # to end of line (treat all # as comment starters)
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

if (result$model_provided) {
	quiet_pkg("lavaan")
	cfa_out <- tryCatch({
		fit <- lavaan::cfa(cleaned_model_syntax, data = df, std.lv = FALSE)
		fm <- lavaan::fitMeasures(fit, c("chisq","df","pvalue","cfi","tli","rmsea","srmr"))
		pe <- lavaan::parameterEstimates(fit, standardized = TRUE)
		loadings <- subset(pe, op == "=~", select = c("lhs","rhs","est","std.all"))
		list(
			fit_measures = as.list(fm),
			loadings = lapply(seq_len(nrow(loadings)), function(i) {
				list(latent = loadings$lhs[i], indicator = loadings$rhs[i], estimate = loadings$est[i], std_all = loadings$std.all[i])
			})
		)
	}, error = function(e) {
		result$status <<- "cfa_error"
		list(error = as.character(e))
	}, warning = function(w) {
		# Capture first warning; more could be added
		result$warning <<- as.character(w)
		invokeRestart("muffleWarning")
	})
	result <- c(result, cfa_out)
}

jsonlite::write_json(result, output_path, auto_unbox = TRUE, pretty = FALSE)
invisible(NULL)
