import os
import importlib
import openai
import json
import pandas as pd
import numpy as np
from scipy import stats
import pingouin as pg

import time


# ---------------------- functions ----------------------

# Load questions from a JSON file
def load_questions(file_path):
    """
    Loads questions from a JSON file.
    """
    with open(file_path, 'r', encoding='utf-8') as file:
        return json.load(file)

# questions_file = "questions.json"
# questions = load_questions(questions_file)


# Removed specific OpenAI exception imports (not available in this environment)

def get_chatgpt_response(user_input, messages, temperature=0.7, model="gpt-4o", api_key=None):
    """
    Sends a prompt to ChatGPT and retrieves the response, handling errors and retries.
    """
    client = openai.OpenAI(api_key=api_key)
    # Append user's input to the conversation history
    messages.append({"role": "user", "content": user_input})
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
        )
    except Exception as e:
        err_msg = str(e).lower()
        # Retry on rate-limiting errors
        if 'rate limit' in err_msg:
            print("Rate limit exceeded. Retrying in 5 seconds...", e)
            time.sleep(5)
            return get_chatgpt_response(user_input, messages, temperature, model, api_key)
        # Log other API errors and propagate
        print("OpenAI API error:", e)
        raise
    # Extract assistant's reply
    assistant_reply = response.choices[0].message.content
    # Append assistant's reply to history
    messages.append({"role": "assistant", "content": assistant_reply})
    return assistant_reply, messages

def analyze_anova(data):
    """
    Analyzes data using ANOVA and returns the results.
    """
    print(data)
    return



def analyze_content_adequacy(
    df,
    intended_map,
    item_col="item",
    rater_col="rater",
    facet_col="facet",
    rating_col="rating",
    alpha=0.05,
    require_target_highest=True,
    drop_incomplete=True,
    decision_mode="binary",   # "binary" or "ternary"
    sphericity="GG",          # "GG", "HF", or "none"
):
    """
    MacKenzie, Podsakoff & Podsakoff (2011) / Hinkin & Tracey (1999)
    One-way RM-ANOVA per item (facet within rater) + planned contrast
    (intended facet > mean of others, one-sided). Uses GG/HF correction
    to the error term as recommended.
    """
    required = {item_col, rater_col, facet_col, rating_col}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required column(s): {sorted(missing)}")
    if sphericity not in {"GG", "HF", "none"}:
        raise ValueError("sphericity must be 'GG', 'HF', or 'none'")

    rows = []
    for it in sorted(df[item_col].unique(), key=lambda x: str(x)):
        target = intended_map.get(it, None)
        d = df[df[item_col] == it].copy()

        facets = sorted(d[facet_col].unique(), key=lambda x: str(x))
        k = len(facets)
        note_msgs = []

        if target is None:
            rows.append(_empty_row(it, target, d[rater_col].nunique(), k,
                                  notes="No intended facet provided"))
            continue
        if k < 2:
            rows.append(_empty_row(it, target, d[rater_col].nunique(), k,
                                  notes="Fewer than 2 facets"))
            continue
        if target not in facets:
            rows.append(_empty_row(it, target, d[rater_col].nunique(), k,
                                  notes=f"Intended facet '{target}' not in observed facets"))
            continue

        # Ensure each rater contributed a complete within-subject profile (MacKenzie/Hinkin–Tracey design)
        if drop_incomplete:
            counts = d.groupby(rater_col)[facet_col].nunique()
            keep_ids = counts[counts == k].index
            dropped = counts.size - keep_ids.size
            if dropped > 0:
                note_msgs.append(f"dropped {dropped} incomplete rater(s)")
            d = d[d[rater_col].isin(keep_ids)]

        n_raters = d[rater_col].nunique()
        if n_raters < 2:
            rows.append(_empty_row(it, target, n_raters, k,
                                  notes="Fewer than 2 raters after filtering"))
            continue

        # 1) Omnibus RM-ANOVA with GG/HF correction per MacKenzie/Winer
        try:
            aov = pg.rm_anova(dv=rating_col,within=facet_col,subject=rater_col,data=d,detailed=True,correction=True,effsize="np2",  # ask pingouin for partial eta-squared
            )
            row = aov.loc[aov["Source"] == facet_col].iloc[0]

            # Numerator df: 'DF' (pingouin); fallback to 'ddof1' if present
            df1 = float(row["DF"] if "DF" in row else row.get("ddof1", np.nan))

            # Uncorrected denominator df for within-subject one-way: (k-1)*(n-1)
            df2_unc = (k - 1) * (n_raters - 1)

            # Epsilon and corrected p-values
            eps = float(row.get("eps", np.nan))
            if sphericity == "GG":
                p_omnibus = float(row.get("p-GG-corr", row["p-unc"]))
                df2_corr = eps * df2_unc if np.isfinite(eps) else np.nan
            elif sphericity == "HF":
                p_omnibus = float(row.get("p-HF-corr", row["p-unc"]))
                # HF-corrected df is approximately eps_HF * df2_unc; pingouin doesn’t return eps_HF,
                # so report uncorrected df2 and note HF p used.
                df2_corr = np.nan
            else:
                p_omnibus = float(row["p-unc"])
                df2_corr = np.nan

            F = float(row["F"])
            # Prefer pingouin's np2; fallback to formula with uncorrected df if needed
            eta_p2 = float(row["np2"]) if "np2" in row else (
                (F * df1) / (F * df1 + df2_unc) if np.isfinite(F) else np.nan
            )
        except Exception as e:
            rows.append(_empty_row(it, target, n_raters, k, notes=f"ANOVA error: {e}"))
            continue

        # 2) Planned contrast: intended facet vs mean(other facets), one-sided (greater)
        pivot = d.pivot_table(index=rater_col, columns=facet_col, values=rating_col)
        pivot = pivot[facets]
        weights = np.array([1.0 if f == target else -1.0/(k-1) for f in facets])
        contrast_scores = pivot.values.dot(weights)

        t_stat, p_two = stats.ttest_1samp(contrast_scores, 0.0)
        mean_c = contrast_scores.mean()
        if np.isnan(t_stat):
            p_one = np.nan
        else:
            p_one = (p_two / 2.0) if mean_c > 0 else (1.0 - p_two / 2.0)
        df_t = contrast_scores.size - 1
        dz = mean_c / contrast_scores.std(ddof=1) if contrast_scores.size > 1 else np.nan

        # Descriptives + highest facet check
        facet_means = d.groupby(facet_col)[rating_col].mean()
        intended_mean = float(facet_means.loc[target])
        others_mean = float(facet_means.drop(labels=[target]).mean())
        mean_diff = intended_mean - others_mean
        target_is_highest = facet_means.idxmax() == target

        # 3) Decision per MacKenzie/Hinkin–Tracey
        omnibus_sig = (p_omnibus < alpha)
        contrast_sig = (p_one < alpha)
        keep = omnibus_sig and contrast_sig and (target_is_highest if require_target_highest else True)

        if decision_mode == "binary":
            action = "keep" if keep else "revise/delete"
        elif decision_mode == "ternary":
            if (not omnibus_sig) or (require_target_highest and not target_is_highest):
                action = "delete"
            elif omnibus_sig and (not contrast_sig):
                action = "revise"
            else:
                action = "keep"
        else:
            raise ValueError("decision_mode must be 'binary' or 'ternary'")

        rows.append({
            "item": it,
            "intended_facet": target,
            "n_raters": n_raters,
            "k_facets": k,
            "alpha": alpha,
            "F": F,
            "df1": df1,
            "df2_uncorr": df2_unc,
            "df2_corr": df2_corr,    # GG-corrected df2 if available; else NaN
            "epsilon": eps,          # GG epsilon (if estimated)
            "p_omnibus": p_omnibus,  # GG/HF/uncorrected p as requested
            "eta_p2": eta_p2,
            "intended_mean": intended_mean,
            "others_mean": others_mean,
            "mean_diff": mean_diff,
            "t_contrast": t_stat,
            "df_t": df_t,
            "p_contrast_one_sided": p_one,
            "dz": dz,
            "target_is_highest": target_is_highest,
            "keep": keep,
            "action": action,
            "notes": "; ".join(note_msgs + [f"sphericity={sphericity}"])
        })

    return pd.DataFrame(rows).sort_values(by="item").reset_index(drop=True)


def _empty_row(it, target, n_raters, k, notes):
    return {
        "item": it,
        "intended_facet": target,
        "n_raters": n_raters,
        "k_facets": k,
        "alpha": np.nan,
        "F": np.nan,
        "df1": np.nan,
        "df2_uncorr": np.nan,
        "df2_corr": np.nan,
        "epsilon": np.nan,
        "p_omnibus": np.nan,
        "eta_p2": np.nan,
        "intended_mean": np.nan,
        "others_mean": np.nan,
        "mean_diff": np.nan,
        "t_contrast": np.nan,
        "df_t": np.nan,
        "p_contrast_one_sided": np.nan,
        "dz": np.nan,
        "target_is_highest": False,
        "keep": False,
        "action": "revise/delete",
        "notes": notes
    }