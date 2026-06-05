/* =============================================================================
   FPAS Mark II — Central Bank Transparency Index
   Questionnaire data model
   -----------------------------------------------------------------------------
   Each question has:
     id, code, text, and either:
       - options: [{label, score}]                      (simple question)
       - branches: { key: {label, note, options:[...]} } (conditional question)
   Branch selection for Section B (baseline vs scenarios) is no longer a manual
   toggle: it is determined ONCE by the Regime Detection step (see
   REGIME_DETECTION below), which classifies the bank as Non-FPAS, FPAS Mark I,
   or FPAS Mark II and routes B4–B8 to the matching scale automatically.
   A3 and C4 still have their own per-question toggle.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   Regime Detection — completed once, before scoring Section B.
   Two diagnostic questions (RD1, RD2) classify the bank into exactly one of
   three regimes; that classification fixes which scale B4–B8 use:
     • Non-FPAS    → baseline scale (B4.1–B8.1)  — scores low on Section B
     • FPAS Mark I → baseline scale (B4.1–B8.1)
     • FPAS Mark II→ prudent risk-management scale (B4.2–B8.2)
   --------------------------------------------------------------------------- */
const REGIME_DETECTION = {
  title: "Regime Detection",
  subtitle: "Complete once, before scoring Section B",
  intro:
    "Classify the central bank's published forecasting and projection framework into exactly one of the three regimes below. " +
    "This classification is made once and determines which scale is applied to questions B4–B8. " +
    "Sections A and C, and questions B1–B3 and B9, are scored identically regardless of regime.",
  questions: [
    {
      code: "RD1",
      text: "Does the central bank publish projections in which the policy interest rate is an endogenous output of the model — i.e., a path that responds within the model to the projected evolution of the economy — rather than a constant-rate or externally imposed (exogenous) path?",
      options: [
        { key: "no", label: "No — projections use a constant or exogenous policy-rate assumption.", routeTo: "non-fpas" },
        { key: "yes", label: "Yes — the policy path is endogenous.", routeTo: "RD2" }
      ]
    },
    {
      code: "RD2",
      text: "Does the central bank regularly publish a structured set of multiple scenarios (e.g., Case A and Case B, or Case X and Case Y) / prudent risk-management scenarios, each with its own consistent macroeconomic and policy paths, rather than a single baseline projection?",
      showWhen: { RD1: "yes" },
      options: [
        { key: "no", label: "No — a single baseline projection is published.", routeTo: "mark-i" },
        { key: "yes", label: "Yes — a structured set of scenarios is published.", routeTo: "mark-ii" }
      ]
    }
  ],
  // Resulting regime → Section B scale and descriptive note.
  regimes: {
    "non-fpas": {
      label: "Non-FPAS",
      scale: "baseline",
      short: "Baseline scale (B4.1–B8.1)",
      desc: "Policy path is constant/exogenous; not a genuine FPAS in the sense used here. Scored on the baseline scale (B4.1–B8.1) — the bank cannot attain the endogenous-policy-path gradations and will therefore score low on Section B."
    },
    "mark-i": {
      label: "FPAS Mark I",
      scale: "baseline",
      short: "Baseline scale (B4.1–B8.1)",
      desc: "A single baseline projection with an endogenous policy path. Scored on the baseline scale (B4.1–B8.1)."
    },
    "mark-ii": {
      label: "FPAS Mark II",
      scale: "scenarios",
      short: "Prudent risk-management scale (B4.2–B8.2)",
      desc: "A structured set of multiple / prudent risk-management scenarios with associated policy paths. Scored on the prudent risk-management scale (B4.2–B8.2)."
    }
  }
};

const QUESTIONNAIRE = {
  title: "An Index for Transparency for Inflation-Targeting Central Banks",
  subtitle: "FPAS Mark II — Central Bank Transparency Index (Updated Version, with consolidated regime detection)",
  sections: [
    {
      id: "A",
      title: "Monetary Policy Objectives",
      maxNote: "Max. Score 4",
      questions: [
        {
          code: "A1",
          text: "Is there a formal statement of the objectives of monetary policy emphasizing the dual mandate (or multiple objectives), and is inflation the primary objective? Is it easily accessible on the central bank's website?",
          options: [
            { label: "Single inflation objective or multiple policy objectives without prioritization.", score: 0.0 },
            { label: "Inflation as the primary objective such that any other objective (output, etc.) cannot be inconsistent with the primary objective of anchoring inflation and inflation expectations.", score: 1.0 }
          ]
        },
        {
          code: "A2",
          text: "Is the inflation target defined clearly?",
          options: [
            { label: "No medium-term numerical target over a horizon of 2–3 years or more (hereafter medium term).", score: 0.0 },
            { label: "Inflation target defined as a \"tolerance\" or \"control range\" target. Defined as a medium-term target, but the meaning of the range or band is not clear.", score: 0.5 },
            { label: "Inflation target defined as a well-defined point target. If a band is used, it is clearly communicated.", score: 1.0 }
          ]
        },
        {
          code: "A3",
          text: "Might financial stability objectives override the primacy of the inflation (price stability) objective? If the central bank does not have a financial stability responsibility, it should be explicit that it uses the policy interest rate tool to affect financial conditions to the extent that it affects the output gap and, hence, achieving the inflation target.",
          branchToggle: {
            label: "Financial stability responsibility",
            options: [
              { key: "i", label: "(i) Another institution is responsible for financial stability" },
              { key: "ii", label: "(ii) Central bank is at least partly responsible for financial stability" }
            ]
          },
          branches: {
            i: {
              options: [
                { label: "Central bank cares about financial stability to the extent that it affects stabilization objectives (output and unemployment), but it is unclear that inflation is the primary objective.", score: 0.0 },
                { label: "Central bank cares about financial stability to the extent that it affects stabilization objectives (output and unemployment) and makes it clear that inflation is the primary objective.", score: 1.0 }
              ]
            },
            ii: {
              options: [
                { label: "The borderlines between the monetary policy and financial stability tools are unclear. This creates confusion about the primary objective of price stability.", score: 0.0 },
                { label: "The central bank has both monetary policy and macroprudential tools and it is clear how the central bank adjusts its tools to achieve its monetary policy and financial stability objectives.", score: 1.0 }
              ]
            }
          }
        },
        {
          code: "A4",
          text: "Does the central bank use a loss function evaluation to show how well it has been doing in managing the short-run output–inflation tradeoff?",
          options: [
            { label: "No.", score: 0.0 },
            { label: "Yes.", score: 1.0 }
          ]
        }
      ]
    },
    {
      id: "B",
      title: "Forecasting and Policy Analysis System",
      maxNote: "Max. Score 14",
      frameworkNote: "Questions B1–B3 and B9 apply to all regimes. For B4–B8 the scale is set automatically by the Regime Detection step above: the baseline scale (Non-FPAS / FPAS Mark I) or the prudent risk-management scale (FPAS Mark II).",
      questions: [
        {
          code: "B1",
          text: "Are the basic economic data relevant for the conduct of monetary policy publicly available in a downloadable format from the central bank's website (could also include links to other statistical agencies)? For example, data reported in the monetary policy reports should be made available on the website.",
          options: [
            { label: "No database is publicly available.", score: 0.0 },
            { label: "A minimal set of series is publicly available: output gap or other measure of capacity utilization, inflation, inflation expectations, wages, unemployment, and GDP.", score: 0.5 },
            { label: "All series used in producing the MPR are published in a downloadable format (e.g., Excel), including at least the seven series above.", score: 1.0 }
          ]
        },
        {
          code: "B2",
          text: "Is the core quarterly projection model (model used for policy-making) publicly available, and has documentation been updated within the last 5 years?",
          options: [
            { label: "No.", score: 0.0 },
            { label: "Yes, in a \"working paper\" format only, i.e., irreproducible.", score: 0.25 },
            { label: "Yes, in a working paper and with code.", score: 0.5 },
            { label: "Yes, in a working paper, with code, and web-based front-end to modify forecast assumptions.", score: 1.0 }
          ]
        },
        {
          code: "B3",
          text: "How transparent is the central bank about the reaction functions (or loss functions) used to compute the interest rate paths (or paths for other instruments when the ELB constrains the policy rate) in its regular projection exercises? Do the monetary policy reports reference the core model documentation containing the reaction function or loss function?",
          options: [
            { label: "The central bank does not publish either the reaction function or the loss function.", score: 0.0 },
            { label: "The central bank publishes the reaction function and/or loss function (with the coefficients) in an easily accessible place on its website.", score: 1.0 }
          ]
        },
        {
          code: "B4",
          text: "For which variables does the central bank publish consistent quarterly macroeconomic projections (over a horizon of at least two years), including an endogenous instrument (e.g., policy rate)?",
          framework: true,
          branches: {
            baseline: {
              note: "Baseline scale (B4.1) — Non-FPAS / FPAS Mark I (for the baseline scenario)",
              options: [
                { label: "None.", score: 0.0 },
                { label: "Inflation.", score: 0.2 },
                { label: "Inflation and GDP growth.", score: 0.4 },
                { label: "Inflation, GDP growth, and the endogenous interest rate path.", score: 0.6 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, and the output gap.", score: 0.8 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, the output gap, and the exchange rate.", score: 1.0 }
              ]
            },
            scenarios: {
              note: "Prudent risk-management scale (B4.2) — FPAS Mark II (across the published scenarios)",
              options: [
                { label: "None.", score: 1.0 },
                { label: "Inflation.", score: 1.2 },
                { label: "Inflation and GDP growth.", score: 1.4 },
                { label: "Inflation, GDP growth, and the endogenous interest rate path.", score: 1.6 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, and the output gap.", score: 1.8 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, the output gap, and the exchange rate.", score: 2.0 }
              ]
            }
          }
        },
        {
          code: "B5",
          text: "How does the central bank communicate forecast uncertainty?",
          framework: true,
          branches: {
            baseline: {
              note: "Baseline scale (B5.1) — Non-FPAS / FPAS Mark I: does the central bank regularly publish forecast densities (fan charts)?",
              options: [
                { label: "None.", score: 0.0 },
                { label: "Inflation.", score: 0.2 },
                { label: "Inflation and GDP growth.", score: 0.4 },
                { label: "Inflation, GDP growth, and the endogenous interest rate path.", score: 0.6 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, and the output gap.", score: 0.8 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, the output gap, and the exchange rate.", score: 1.0 }
              ]
            },
            scenarios: {
              note: "Prudent risk-management scale (B5.2) — FPAS Mark II: does it thoroughly discuss the assumptions and shocks underlying its risk-management scenarios?",
              options: [
                { label: "Qualitative / general description.", score: 1.0 },
                { label: "Inflation.", score: 1.2 },
                { label: "Inflation and GDP growth.", score: 1.4 },
                { label: "Inflation, GDP growth, and the endogenous interest rate path.", score: 1.6 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, and the output gap.", score: 1.8 },
                { label: "Inflation, GDP growth, the endogenous interest rate path, the output gap, and the exchange rate.", score: 2.0 }
              ]
            }
          }
        },
        {
          code: "B6",
          text: "Is the methodology underlying the central bank's treatment of uncertainty clear and easily accessible?",
          framework: true,
          branches: {
            baseline: {
              note: "Baseline scale (B6.1) — Non-FPAS / FPAS Mark I: methodology for constructing the forecast densities (fan charts).",
              options: [
                { label: "No fan chart, or the fan-chart methodology is not explained.", score: 0.0 },
                { label: "Fan charts published in all monetary policy reports and the methodology is clearly explained and/or a link to a technical paper is provided.", score: 1.0 }
              ]
            },
            scenarios: {
              note: "Prudent risk-management scale (B6.2) — FPAS Mark II: methodology for constructing the prudent risk-management scenarios (model documentation, taxonomy of shocks, etc.).",
              options: [
                { label: "No.", score: 1.0 },
                { label: "Yes.", score: 2.0 }
              ]
            }
          }
        },
        {
          code: "B7",
          text: "Does the central bank regularly (at least once a year) review its forecasts in the monetary policy reports or in a separate document?",
          framework: true,
          branches: {
            baseline: {
              note: "Baseline scale (B7.1) — Non-FPAS / FPAS Mark I: assessment of forecast revisions (decomposition of forecast changes vis-à-vis the previous forecast).",
              options: [
                { label: "No.", score: 0.0 },
                { label: "For inflation only, with a discussion of the underlying causes.", score: 0.2 },
                { label: "For inflation and GDP growth, with a discussion of the underlying causes.", score: 0.4 },
                { label: "For inflation, GDP growth, and the endogenous interest rate path, with a discussion of the underlying causes.", score: 0.6 },
                { label: "For inflation, GDP growth, the endogenous interest rate path, and the output gap, with a discussion of the underlying causes.", score: 0.8 },
                { label: "For inflation, GDP growth, the endogenous interest rate path, the output gap, and the exchange rate, with a discussion of the underlying causes.", score: 1.0 }
              ]
            },
            scenarios: {
              note: "Prudent risk-management scale (B7.2) — FPAS Mark II: review of forecasting performance (at least for the market-reference scenario).",
              options: [
                { label: "No.", score: 0.0 },
                { label: "Yes — qualitative / general evaluation of the scenarios and assumptions.", score: 1.0 },
                { label: "For inflation only, with a discussion of the underlying causes.", score: 1.2 },
                { label: "For inflation and GDP growth, with a discussion of the underlying causes.", score: 1.4 },
                { label: "For inflation, GDP growth, and the endogenous interest rate path, with a discussion of the underlying causes.", score: 1.6 },
                { label: "For inflation, GDP growth, the endogenous interest rate path, and the output gap, with a discussion of the underlying causes.", score: 1.8 },
                { label: "For inflation, GDP growth, the endogenous interest rate path, the output gap, and the exchange rate, with a discussion of the underlying causes.", score: 2.0 }
              ]
            }
          }
        },
        {
          code: "B8",
          text: "Does the central bank publish alternative scenarios in its monetary policy reports to illustrate key risk(s) in the forecast?",
          framework: true,
          branches: {
            baseline: {
              note: "Baseline scale (B8.1) — Non-FPAS / FPAS Mark I",
              options: [
                { label: "No alternative scenario.", score: 0.0 },
                { label: "The major risk(s) is communicated in an alternative scenario(s).", score: 1.0 }
              ]
            },
            scenarios: {
              note: "Prudent risk-management scale (B8.2) — FPAS Mark II",
              options: [
                { label: "No alternative scenario.", score: 0.0 },
                { label: "The major risk(s) is communicated in an alternative scenario(s).", score: 1.0 },
                { label: "Publishes a market-reference scenario.", score: 2.0 }
              ]
            }
          }
        },
        {
          code: "B9",
          text: "Do the monetary policy reports include historical data and forecasts for financial variables? Financial variables include long-term government bond yields, consumer lending rates, mortgage rates, equity prices, property prices, credit aggregates, corporate risky spreads (e.g., BAA–AAA bond yields), and credit standards (e.g., loan officer surveys). All data should be available in a downloadable format.",
          options: [
            { label: "No data or forecast of financial variables are available.", score: 0.0 },
            { label: "Historical data on fewer than 5 of the above variables, and forecasts for fewer than 5 — partial (specify 0.1–0.9).", score: null, custom: { min: 0.1, max: 0.9, step: 0.1, default: 0.5 } },
            { label: "Historical data on 5 or more of the above variables, and forecasts for 5 or more of the above variables.", score: 1.0 }
          ]
        }
      ]
    },
    {
      id: "C",
      title: "Policy Process",
      maxNote: "Max. Score 7",
      questions: [
        {
          code: "C1",
          text: "Does the central bank publish a press statement immediately following the policy decisions?",
          options: [
            { label: "The central bank does not publish a press statement immediately after the policy decisions.", score: 0.0 },
            { label: "The central bank publishes press statements in the native language only.", score: 0.5 },
            { label: "The central bank publishes press statements in English.", score: 1.0 }
          ]
        },
        {
          code: "C2",
          text: "Is the policy decision explained at a press conference immediately after it is announced? Are the presentations available in English?",
          options: [
            { label: "No.", score: 0.0 },
            { label: "Yes, after all policy meetings, at pre-announced dates and times. The press conference with Q&A is webcast and the recording is made available on the website. Presentations are downloadable only in the native language.", score: 0.5 },
            { label: "Yes, after all policy meetings, at pre-announced dates and times. The press conference with Q&A is webcast and the recording is made available on the website. Presentations are downloadable in English.", score: 1.0 }
          ]
        },
        {
          code: "C3",
          text: "Does the central bank present its regular forecast updates with a Q&A session to journalists, analysts, and market participants? Are the presentations available in English?",
          options: [
            { label: "No.", score: 0.0 },
            { label: "Yes. The presentation and Q&A are available only in the native language.", score: 0.5 },
            { label: "Yes. The presentation and Q&A are available in English.", score: 1.0 }
          ]
        },
        {
          code: "C4",
          text: "Is there a public account of the policy deliberations (\"minutes\") published in less than one month after the meeting? And are one-pagers of Board forecast submissions publicly available?",
          branchToggle: {
            label: "Decision-making structure",
            options: [
              { key: "mpc", label: "(i) Decisions made by a monetary policy committee" },
              { key: "single", label: "(ii) Decisions made by a single policymaker" }
            ]
          },
          branches: {
            mpc: {
              options: [
                { label: "No.", score: 0.0 },
                { label: "Yes, but condensed, non-attributed, and without voting results.", score: 0.5 },
                { label: "Yes, detailed and with voting results on the main policy instrument. Contributions by individual MPC members and votes are not attributed.", score: 1.0 },
                { label: "Yes, detailed and with voting results on the main policy instrument. Contributions by individual MPC members and votes are attributed.", score: 2.0 }
              ]
            },
            single: {
              options: [
                { label: "No.", score: 0.0 },
                { label: "Yes, with arguments/explanations.", score: 1.0 },
                { label: "Yes, one-pagers of forecasts of all Board members are published immediately or after a certain, pre-determined date.", score: 2.0 }
              ]
            }
          }
        },
        {
          code: "C5",
          text: "Is the role of staff and policymakers in the baseline forecast process communicated clearly?",
          options: [
            { label: "No. It is not clear how the forecast is constructed and used in the decision-making process.", score: 0.0 },
            { label: "Yes. The ownership of the forecast and its role in the decision-making process is defined clearly.", score: 1.0 }
          ]
        },
        {
          code: "C6",
          text: "When was the last time the central bank or the government held or invited an external evaluation of the policy framework and the FPAS, and made the results publicly available?",
          options: [
            { label: "No evaluation in last 5 years.", score: 0.0 },
            { label: "Either policy framework or FPAS evaluation in the last 5 years.", score: 0.5 },
            { label: "Both policy framework and FPAS evaluation in the last 5 years.", score: 1.0 }
          ]
        }
      ]
    }
  ]
};
