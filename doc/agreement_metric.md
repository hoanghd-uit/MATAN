# Krippendorff’s Alpha ($\alpha$) Theoretical Specification

This document provides a formal theoretical specification of **Krippendorff’s Alpha ($\alpha$)**, designed as a reference for AI agents and software engineers implementing inter-rater reliability calculations.

---

## 1. Definition & Core Concept

**Krippendorff’s Alpha ($\alpha$)** is a general statistical measure of inter-rater reliability that quantifies the degree of agreement among an arbitrary number of evaluators (human annotators, sensors, or AI agents) assigning values to a set of units (items, frames, or timesteps).

### Key Properties & Advantages

Unlike older agreement coefficients (e.g., Cohen’s Kappa, Fleiss’ Kappa), Krippendorff’s $\alpha$ satisfies the following requirements for complex data analysis:

* **Missing Data Resilience:** Natively accommodates incomplete datasets where different subsets of raters evaluate different units, or where raters fail/abstain on certain rows.
* **Arbitrary Rater Ensembles:** Supports any number of evaluators ($R \ge 2$), and does not require every evaluator to score every unit.
* **Measurement Scale Adaptability:** Applies identical mathematical structure across Nominal, Ordinal, Interval, and Ratio measurement scales by swapping only the distance function.
* **Sample Size Invariance:** Generates comparable reliability scores regardless of the number of evaluated units or sample sizes.

---

## 2. Conceptual Framework

Krippendorff’s $\alpha$ evaluates reliability by comparing the **Observed Disagreement** among evaluators to the **Expected Disagreement** that would occur if values were assigned purely by random chance based on the marginal distribution of all assigned values:

$$\alpha = 1 - \frac{D_o}{D_e}$$

Where:

* $D_o$: The observed disagreement among ratings assigned to the same unit.
* $D_e$: The expected disagreement if ratings were randomly paired across the entire dataset.

### Score Interpretation Thresholds

| $\alpha$ Score Range | Reliability Interpretation | Data Usage Benchmark |
| --- | --- | --- |
| $\alpha = 1.0$ | **Perfect Agreement** | Ratings are identical across all evaluators and units. |
| $0.80 \le \alpha < 1.0$ | **High Reliability** | Standard benchmark for relying on data without reservation. |
| $0.67 \le \alpha < 0.80$ | **Tentative Reliability** | Acceptable for exploratory analysis or tentative conclusions. |
| $0.0 < \alpha < 0.67$ | **Low Reliability / High Noise** | Unreliable data; systematic disagreement or severe noise present. |
| $\alpha \le 0.0$ | **Chance or Opposite Agreement** | Disagreement exceeds chance expectation (raters actively contradict). |

---

## 3. Mathematical Formulation

### Variable Definitions

Given a dataset of $U$ units (e.g., timesteps $u = 1, 2, \dots, U$):

* $V$: The set of all unique values assigned across all units by any evaluator.
* $m_u$: The number of evaluators who scored unit $u$ ($m_u \ge 2$).
* $n_{uv}$: The number of times value $v \in V$ was assigned to unit $u$.
* $n_v$: The total frequency of value $v$ across the entire dataset:

$$n_v = \sum_{u=1}^{U} n_{uv}$$


* $n$: The total number of pairable values across all units:

$$n = \sum_{u=1}^{U} m_u$$



---

### Observed Disagreement ($D_o$)

Observed disagreement measures the average distance between all pairs of values assigned to the same unit:

$$D_o = \frac{1}{\sum_{u=1}^{U} m_u(m_u - 1)} \sum_{u=1}^{U} \sum_{v \in V} \sum_{v' \in V} n_{uv} n_{uv'} \, \delta^2(v, v')$$

---

### Expected Disagreement ($D_e$)

Expected disagreement measures the average distance between all possible pairs of values in the entire dataset, ignoring unit boundaries:

$$D_e = \frac{1}{n(n - 1)} \sum_{v \in V} \sum_{v' \in V} n_v n_{v'} \, \delta^2(v, v')$$

Where $\delta^2(v, v')$ represents a **Metric Distance Function** specific to the data's scale of measurement.

---

## 4. Metric Distance Functions $\delta^2(v, v')$

The distance function $\delta^2(v, v')$ defines the penalty assigned to a disagreement between value $v$ and value $v'$.

### A. Nominal Scale

Used for distinct categorical labels with no inherent order (e.g., classification tags, tool choices):

$$\delta^2(v, v') = \begin{cases} 0 & \text{if } v = v' \\ 1 & \text{if } v \neq v' \end{cases}$$

### B. Ordinal Scale

Used for ordered discrete ranks (e.g., `Low < Medium < High` or priority levels):

$$\delta^2(v, v') = \left( \sum_{g=v}^{v'} n_g - \frac{n_v + n_{v'}}{2} \right)^2$$

Where $g$ ranges over the ordered values between $v$ and $v'$.

### C. Interval Scale

Used for continuous numerical variables where differences are linear and meaningful (e.g., Valence/Arousal scores $[-1.0, 1.0]$, confidence values, temperature):

$$\delta^2(v, v') = (v - v')^2$$

### D. Ratio Scale

Used for continuous non-negative numerical variables with a true zero point (e.g., physical duration, token counts):

$$\delta^2(v, v') = \left( \frac{v - v'}{v + v'} \right)^2$$