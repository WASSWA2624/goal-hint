# Goal Hint company registration materials

The editable Word package is prepared for a Ugandan Single Member Company limited
by shares. **GOAL HINT SMC LTD** is a proposed name, subject to URSB approval.
Goal Hint provides software and football information subscriptions. It does not
accept betting stakes or place bets for customers.

Open `01-registration/00-start-here.docx` first. Fill bracketed fields privately.
The package has not been filed, signed, certified or approved by a payment provider.
Requirements were checked against official sources on **26 October 2026**.

## Word documents

| Folder | Documents |
| --- | --- |
| `01-registration` | Start guide; registration information; memorandum and standard articles adoption; nominee appointments and consents; member and beneficial ownership register |
| `02-banking-and-payments` | Company profile; member and director resolutions; separate bank, MTN and Airtel application letters; payment operations and disclosures |
| `03-customer-policies` | Service terms and refunds; privacy notice, both for approval before publication |
| `00-guidance` | Official sources, form mapping and continuing responsibilities |

The constitution uses URSB's lean SMC model and adopts the statutory articles
without modification. Use current official forms for prescribed filings. Obtain
government certificates and genuine certification from the issuing institutions.

The app implements plan-only prepaid credit and optional renewal from that credit.
These features are disclosed in the provider materials. API integration is a
proposed next step; no production approval is claimed. Customer policies require
owner approval and alignment with the live application before publication,
including unused-credit treatment when an account is erased.

## Private records and generated files

The original WhatsApp ZIP stays unchanged and is excluded from Git. Keep completed
identity sheets, IDs and credentials in `private/` or another secure location.
Generated DOCX files, downloaded reference PDFs and QA images are also excluded
from Git, following the repository rule about generated output. The reusable
preparation content and builder are versioned so the blank pack can be rebuilt.
Do not regenerate over completed Word files; save completed copies in `private/`.

## Rebuild and verify

Use the Codex workspace dependency loader to locate the bundled Python and Node
runtimes. The Python runtime needs `python-docx`. Run the documents skill's
`mark_artifact_operation_started.mjs` once with operation `create`, expected output
count `12` and format `docx`, immediately before running
`company/tools/build_documents.py` with the bundled Python runtime.

Review content in `content/registration_pack.py` and `content/customer-policies.json`.
The builder writes twelve unprotected, editable DOCX files. Rendering and visual
inspection must follow every content or layout change. The packaged document
renderer is preferred. On this Windows host the runtime does not bundle
LibreOffice; `tools/render_with_word.ps1` exports read-only Word documents to
internal QA PDFs through Microsoft Word. Use bundled Poppler to produce page PNGs
and inspect every page. QA output stays in `.work/`.
