#!/usr/bin/env Rscript

# Simple analysis script: reads JSON rows, computes mean of each numeric column,
# writes JSON result expected by Python runner.
#
# Invocation (from Python): Rscript custom_analysis.R <input_json> <output_json>
# <input_json>: JSON array of objects (list of records)
# <output_json>: destination JSON file to create
#
# Output structure example:
# {
#   "status": "ok",
#   "n_rows": 10,
#   "n_cols": 5,
#   "numeric_columns": ["col1","col2"],
#   "column_means": {"col1": 3.5, "col2": 7.1}
# }

suppressWarnings({
	if (!requireNamespace("jsonlite", quietly = TRUE)) {
		install.packages("jsonlite", repos = "https://cloud.r-project.org")
	}
})
library(jsonlite)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
	stop("Expected two arguments: <input_json> <output_json>")
}
input_path  <- args[1]
output_path <- args[2]

safe_read <- function(path) {
	txt <- readLines(path, warn = FALSE)
	if (length(txt) == 0) return(list())
	fromJSON(paste(txt, collapse = "\n"))
}

data_list <- safe_read(input_path)

# Coerce to data.frame; if empty list, produce empty data.frame
df <- tryCatch({
	as.data.frame(data_list, stringsAsFactors = FALSE)
}, error = function(e) data.frame())

num_cols <- names(df)[vapply(df, is.numeric, logical(1))]

result <- list(
	status = "ok",
	n_rows = nrow(df),
	n_cols = ncol(df),
	numeric_columns = num_cols
)

if (length(num_cols) == 0) {
	result$status <- "no_numeric_columns"
	result$column_means <- list()
} else {
	means <- vapply(df[num_cols], function(x) mean(x, na.rm = TRUE), numeric(1))
	# Convert to a named list for JSON
	result$column_means <- as.list(means)
}

# Write output JSON
write_json(result, output_path, auto_unbox = TRUE, pretty = FALSE)

invisible(NULL)
