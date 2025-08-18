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
    Content-adequacy per MacKenzie, Podsakoff & Podsakoff (2011) / Hinkin & Tracey (1999).

    For each item:
      1) One-way repeated-measures ANOVA (within = facet, subject = rater) with GG/HF correction
      2) Planned contrast: intended facet > mean(other facets), one-sided
      3) Decision:
         - binary: keep if omnibus sig AND contrast sig (and optionally target highest), else revise/delete
         - ternary:
             delete if omnibus non-sig OR target not highest
             revise if omnibus sig AND contrast non-sig
             keep if omnibus sig AND contrast sig AND target highest (if required)

    Input df columns: [item, rater, facet, rating]
    intended_map: dict {item -> intended facet}
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
        print(f"Analyzing item: {it}, intended facet: {target}")

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

        # Drop raters without a full facet set (balanced within-subject)
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

        # try:
        # Omnibus RM-ANOVA via pingouin (with GG/HF correction)
        aov = pg.rm_anova(dv=rating_col, within=facet_col, subject=rater_col,
                            data=d, detailed=True, correction=True)
        arow = aov.loc[aov["Source"] == facet_col].iloc[0]
        print(arow)
        # Robustly extract ANOVA fields across pingouin versions
        # Some versions use ddof1/ddof2, others have DF and no ddof2-GG/HF.
        F = float(arow.get("F", np.nan))
        # df1: prefer ddof1, else DF, else theoretical (k-1)
        df1 = float(arow.get("ddof1", arow.get("DF", (k - 1))))
        # Uncorrected df2: prefer ddof2, else compute (k-1)*(n_raters-1)
        df2_unc = float(arow.get("ddof2", (k - 1) * max(n_raters - 1, 0)))
        eps = arow.get("eps", np.nan)
        try:
            eps = float(eps)
        except Exception:
            eps = np.nan

        if sphericity == "GG":
            # Prefer ddof2-GG if present, else GG-corrected df2 using epsilon
            df2 = float(arow.get("ddof2-GG", (eps * df2_unc) if np.isfinite(eps) else df2_unc))
            p_omnibus = float(arow.get("p-GG-corr", arow.get("p-unc", np.nan)))
        elif sphericity == "HF":
            # If ddof2-HF not present, fall back to uncorrected df2
            df2 = float(arow.get("ddof2-HF", df2_unc))
            p_omnibus = float(arow.get("p-HF-corr", arow.get("p-unc", np.nan)))
        else:
            df2 = float(df2_unc)
            p_omnibus = float(arow.get("p-unc", np.nan))
        eta_p2 = (F * df1) / (F * df1 + df2) if np.isfinite(F) else np.nan
        # except Exception as e:
        #     rows.append(_empty_row(it, target, n_raters, k, notes=f"ANOVA error: {e}"))
        #     continue

        # Planned contrast: target vs average(other facets), one-sided (greater)
        pivot = d.pivot_table(index=rater_col, columns=facet_col, values=rating_col)
        pivot = pivot[facets]
        weights = np.array([1.0 if f == target else -1.0/(k-1) for f in facets])
        contrast_scores = pivot.values.dot(weights)

        t_stat, p_two = stats.ttest_1samp(contrast_scores, 0.0)
        mean_c = contrast_scores.mean()
        if np.isnan(t_stat):
            p_one = np.nan
        else:
            # convert two-sided to one-sided (greater)
            p_one = (p_two / 2.0) if mean_c > 0 else (1.0 - p_two / 2.0)
        df_t = contrast_scores.size - 1
        dz = mean_c / contrast_scores.std(ddof=1) if contrast_scores.size > 1 else np.nan

        # Means and highest facet check
        facet_means = d.groupby(facet_col)[rating_col].mean()
        intended_mean = facet_means.loc[target]
        others_mean = facet_means.drop(labels=[target]).mean()
        mean_diff = intended_mean - others_mean
        target_is_highest = facet_means.idxmax() == target

        # Decisions
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
            "F": F,
            "df1": df1,
            "df2": df2,
            "p_omnibus": p_omnibus,
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
            "notes": "; ".join(note_msgs)
        })

    return pd.DataFrame(rows).sort_values(by="item").reset_index(drop=True)


def _empty_row(it, target, n_raters, k, notes):
    return {
        "item": it,
        "intended_facet": target,
        "n_raters": n_raters,
        "k_facets": k,
        "F": np.nan,
        "df1": np.nan,
        "df2": np.nan,
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
