"""Public preparation templates. Never put completed personal details in this file."""

CHECKED_ON = "26 October 2026"


def p(text):
    return {"type": "paragraph", "text": text}


def h(text):
    return {"type": "heading", "text": text}


def bullets(*items):
    return {"type": "bullets", "items": list(items)}


def fields(*items):
    return {"type": "fields", "items": list(items)}


def table(headers, rows, widths=None):
    return {"type": "table", "headers": headers, "rows": rows, "widths": widths}


def page(heading, *blocks):
    return {"heading": heading, "blocks": list(blocks)}


def document(filename, title, status, *pages):
    return {"filename": filename, "title": title, "status": status, "pages": list(pages)}


BUSINESS_DESCRIPTION = (
    "Goal Hint develops and operates web and mobile software that publishes football fixtures, "
    "scores, statistical forecasts, probabilities, analysis and recorded prediction outcomes. "
    "It offers optional subscriptions for premium information and tools for organizing and "
    "tracking selections. Subscription payments buy access to information. Goal Hint does "
    "not accept betting stakes or place bets for customers."
)

DOCUMENTS = [
    document(
        "01-registration/00-start-here.docx",
        "Goal Hint company registration guide",
        "Uganda Single Member Company preparation package | Checked 26 October 2026",
        page(
            "The recommended registration route",
            p("Prepare Goal Hint as a Ugandan private company limited by shares with one member, as requested in the WhatsApp conversation of 21 October 2026. Proposed legal name: GOAL HINT SMC LTD, subject to URSB name approval. Use the approved name consistently in every final document. Goal Hint can remain the product brand."),
            p(BUSINESS_DESCRIPTION),
            p("These editable documents provide the wording and information needed for incorporation and merchant onboarding. Complete bracketed fields before use. They do not replace a government certificate, a tax registration, a provider contract or any certification that a receiving institution requires."),
            h("Complete these steps in order"),
            bullets(
                "Fill the registration information sheet. Confirm the member, share capital, physical office and two distinct succession nominees. A secretary is optional for the SMC.",
                "Reserve the legal name through URSB. Suggested alternatives are GOAL HINT TECHNOLOGIES SMC LTD and GOAL HINT DIGITAL SERVICES SMC LTD; availability has not been checked.",
                "Have the member and witness execute the memorandum and adoption of the standard SMC articles. Complete the current official nominee form with both nominees' consents.",
                "Submit the current URSB or OBRS incorporation forms and supporting records. Pay against official payment references and retain receipts.",
                "After incorporation, record ownership, complete beneficial ownership filing, obtain the company TIN, and address local trading permission for the actual premises.",
                "Sign the company resolutions after incorporation. Open the company bank account, then apply for merchant collections and production API access.",
                "Approve and publish the customer policies only after completing their fields and confirming that the service actually follows them."
            ),
            h("Use the correct people"),
            p("The single member owns the shares and must be a director. A nominee director and an alternate nominee director are separate individuals, neither being the member nor the secretary. Their appointment supports continuity following death; it does not give either person ownership. A secretary does not automatically inherit the company. The sole director cannot also be its secretary."),
        ),
        page(
            "Your files and missing information",
            table(
                ["File", "Use"],
                [
                    ["01 Registration information", "Collect company, member, nominee and capital particulars"],
                    ["02 Memorandum and articles", "Sign the constitution using the approved name"],
                    ["03 Nomination and consent", "Prepare the official SMC nomination filing"],
                    ["04 Ownership register", "Record member and beneficial ownership details"],
                    ["05 Company profile", "Explain the actual service to registrars and providers"],
                    ["06 Company resolutions", "Authorize banking, collections and named representatives"],
                    ["07 Application letters", "Separate bank, MTN and Airtel requests"],
                    ["08 Payment operations", "Describe money flow and provider disclosures"],
                    ["09 Service terms", "Approve subscription and refund rules"],
                    ["10 Privacy notice", "Complete and approve the data protection disclosures"],
                    ["11 Official sources", "Find current forms, supporting evidence and filing requirements"],
                ],
                [2.3, 4.5],
            ),
            h("Information you must supply"),
            bullets(
                "Approved company name; exact identity-document name of the member; identification, nationality, date of birth, occupation, addresses, telephone and email.",
                "Nominee and alternate nominee details and signatures; secretary details only if appointing one; witness name, occupation, address and signature.",
                "Registered physical office and postal address; official company phone and email; chosen capital, share count, nominal value and subscribed shares.",
                "True beneficial owners and any other person with ultimate control; source of starting funds; selected bank and account signatories.",
                "After registration: incorporation number and date, TIN, official office and director records, and any certified copies requested by the bank or provider.",
                "For launch: actual payment volumes, settlement account, support contacts, hosting and data locations, retention periods and approval of customer policies."
            ),
            p("Keep scans of IDs, completed personal-information sheets and provider credentials in company/private or another secure location. The supplied WhatsApp archive remains unchanged. The repository tracks the blank Word templates, preparation text and builder. Completed private records and QA output stay local."),
            p("Before publishing the customer policies, align account-erasure and unused-credit handling with the refund policy. The current application forfeits remaining credit on erasure; the proposed policy preserves applicable refund rights."),
        ),
        page(
            "Costs and the handover to your registration agent",
            p("The conversation quotes UGX 650,000 through receipt of the incorporation certificate and estimates three days. Treat these as the agent's proposed price and estimate, not an official tariff or guaranteed completion time."),
            table(
                ["Published item", "Amount", "Scope"],
                [
                    ["URSB name reservation", "UGX 35,000", "Confirm current assessment before paying"],
                    ["URSB incorporation", "UGX 105,000", "Nominal capital not exceeding UGX 5,000,000"],
                    ["Known two item subtotal", "UGX 140,000", "Not the total cost of registration or onboarding"],
                    ["URA company TIN issuance", "Free", "Agent assistance can be charged separately"],
                    ["PDPO registration application", "UGX 100,000", "Separate data protection process where applicable"],
                    ["Other costs", "Confirm", "Stamp duty or other assessments, filings, certification, local licence and professional fees"],
                ],
                [2.35, 1.1, 3.35],
            ),
            p("For nominal capital above UGX 5,000,000, URSB publishes an incorporation rate of 1.5% of nominal capital. Agree capital suited to the planned business; authorised capital is different from the shares actually issued and paid. For illustration only, UGX 1,000,000 can be divided into 100 ordinary shares of UGX 10,000; no such capital has been approved in this package."),
            h("Send this request with the completed registration papers"),
            p("Please register the approved name as a Single Member Company limited by shares, using the supplied truthful objects and standard SMC articles. Please confirm the current official forms, the two succession nominees and whether we need a secretary. Please itemise the UGX 650,000 quotation into official charges, certification or stamp charges and your professional fee. State whether beneficial ownership filing, TIN, bank resolution and certified copies are included, and quote any extras before incurring them."),
            h("Collect these records on completion"),
            bullets(
                "Certificate of incorporation; filed memorandum and articles; office and director particulars; filed nominee information; payment receipts and submission acknowledgements.",
                "Beneficial ownership filing acknowledgement and register; company TIN certificate; any required certified copies and bank resolution.",
                "Control of the company's registry contact details and access recovery. Keep company accounts and API credentials under the company's control."
            ),
            p("The sports information description must remain clear in provider applications. If an institution asks whether a specific forecasting or credit feature needs a separate permission, give it the actual feature description and obtain a scope decision. Company objects and registration alone do not decide a sector licence or production API approval."),
            p("Official sources, current form numbering and continuing obligations are in 11 Official sources and filing map."),
        ),
    ),
    document(
        "01-registration/01-registration-information.docx",
        "Goal Hint company registration information",
        "Complete privately before preparing the official URSB filings",
        page(
            "Company particulars",
            p("Proposed structure: a Ugandan Single Member Company limited by shares. Proposed name: GOAL HINT SMC LTD. All names remain subject to reservation. Replace [COMPANY_NAME] throughout the pack with the exact approved legal name."),
            fields(
                ["Approved legal name", "[COMPANY_NAME]"],
                ["Reservation reference and expiry", "[REFERENCE]  [EXPIRY_DATE]"],
                ["Registered office", "[PLOT_BUILDING_STREET]"],
                ["Village or ward and parish", "[VILLAGE_WARD]  [PARISH]"],
                ["Division or subcounty and district", "[DIVISION_SUBCOUNTY]  [DISTRICT]"],
                ["Country", "Uganda"],
                ["Postal address", "[POSTAL_ADDRESS_OR_CONFIRM_PORTAL_REQUIREMENT]"],
                ["Official email and telephone", "[COMPANY_EMAIL]  [COMPANY_PHONE]"],
                ["Website", "https://goalhint.com [CONFIRM_COMPANY_CONTROL]"],
                ["Primary business", "Software and digital football information subscription services"],
            ),
            h("Capital and ownership"),
            fields(
                ["Authorised nominal capital", "UGX [AMOUNT_IN_FIGURES]  [AMOUNT_IN_WORDS]"],
                ["Class and total authorised shares", "Ordinary  [AUTHORISED_SHARE_COUNT]"],
                ["Nominal value per share", "UGX [NOMINAL_VALUE]"],
                ["Shares subscribed by the single member", "[SUBSCRIBED_SHARE_COUNT]"],
                ["Amount paid or unpaid on subscribed shares", "UGX [PAID]  UGX [UNPAID]"],
                ["Source of starting funds", "[TRUE_SOURCE_OF_FUNDS]"],
            ),
            p("Check that authorised share count multiplied by nominal value equals nominal capital. Subscribed shares cannot exceed authorised shares. The sole member holds all issued shares; the beneficial ownership analysis must also identify any other ultimate controller."),
        ),
        page(
            "The single member and director",
            p("Enter the member's exact official identity particulars. A repository display name is not evidence of legal identity. The single member must be a director."),
            fields(
                ["Full legal name", "[MEMBER_FULL_NAME]"],
                ["Previous names if required", "[PREVIOUS_NAMES_OR_NONE]"],
                ["Nationality", "[NATIONALITY]"],
                ["Date of birth age and sex", "[DATE_OF_BIRTH]  [AGE]  [SEX_AS_REQUIRED_BY_FORM]"],
                ["ID or passport type and number", "[DOCUMENT_TYPE]  [DOCUMENT_NUMBER]"],
                ["Occupation", "[OCCUPATION]"],
                ["Residential physical address", "[RESIDENTIAL_ADDRESS]"],
                ["Service and postal addresses", "[SERVICE_ADDRESS]  [POSTAL_ADDRESS]"],
                ["Telephone and email", "[MEMBER_PHONE]  [MEMBER_EMAIL]"],
                ["Individual TIN if required", "[MEMBER_TIN_OR_TO_OBTAIN]"],
                ["Other directorships if requested", "[DETAILS_OR_NONE]"],
                ["Other directors if any", "[DETAILS_OR_NONE]"],
            ),
            h("Secretary decision"),
            fields(
                ["Appoint a secretary", "[YES_OR_NO]"],
                ["If yes full name and ID", "[SECRETARY_NAME]  [ID_TYPE_AND_NUMBER]"],
                ["Physical and postal address", "[SECRETARY_ADDRESSES]"],
                ["Occupation email and telephone", "[SECRETARY_OCCUPATION]  [EMAIL]  [PHONE]"],
            ),
            p("A secretary is optional under the SMC standard articles. If appointed, the secretary is separate from the sole director and from each succession nominee. A secretary is not required to own shares and does not automatically become the owner on death."),
        ),
        page(
            "Succession nominees and execution details",
            p("Choose two distinct individuals who understand and consent to the statutory continuity role. Neither may be the member or the company secretary. Do not add either person as a shareholder merely because they are a nominee."),
            h("Nominee director"),
            fields(
                ["Full name and nationality", "[NOMINEE_FULL_NAME]  [NATIONALITY]"],
                ["Date of birth age and sex", "[DATE_OF_BIRTH]  [AGE]  [SEX_AS_REQUIRED_BY_FORM]"],
                ["Occupation and identity record", "[OCCUPATION]  [ID_TYPE_AND_NUMBER]"],
                ["Physical and postal addresses", "[PHYSICAL_ADDRESS]  [POSTAL_ADDRESS]"],
                ["Telephone and email", "[PHONE]  [EMAIL]"],
            ),
            h("Alternate nominee director"),
            fields(
                ["Full name and nationality", "[ALTERNATE_FULL_NAME]  [NATIONALITY]"],
                ["Date of birth age and sex", "[DATE_OF_BIRTH]  [AGE]  [SEX_AS_REQUIRED_BY_FORM]"],
                ["Occupation and identity record", "[OCCUPATION]  [ID_TYPE_AND_NUMBER]"],
                ["Physical and postal addresses", "[PHYSICAL_ADDRESS]  [POSTAL_ADDRESS]"],
                ["Telephone and email", "[PHONE]  [EMAIL]"],
            ),
            h("Witness and filing representative"),
            fields(
                ["Witness full name", "[WITNESS_FULL_NAME]"],
                ["Witness occupation and address", "[OCCUPATION]  [WITNESS_ADDRESS]"],
                ["Filing representative and contact", "[AGENT_NAME]  [CONTACT]"],
                ["Authority given to representative", "[PREPARE_AND_SUBMIT_SPECIFIED_FILINGS]"],
                ["Member verification", "Signature: __________________  Date: [DATE]"],
            ),
            p("Attach identity copies only through the secure process requested by URSB or the receiving institution. Obtain real signatures from the named people. Do not sign for a nominee, invent a witness or fill incorporation details before they exist."),
        ),
    ),
    document(
        "01-registration/02-memorandum-and-articles.docx",
        "Memorandum of association",
        "The Republic of Uganda | A Single Member Company limited by shares",
        page(
            "Memorandum of association of the company",
            p("1. The name of the company is [COMPANY_NAME]. The approved name shall carry the required Single Member Company suffix."),
            p("2. The registered office of the company will be situated in Uganda."),
            p("3. The objects for which the company is established are:"),
            bullets(
                "To develop, operate, maintain and supply websites, mobile applications, software and related digital information services.",
                "To collect, analyse and publish lawfully obtained football and sports information, fixtures, scores, statistics, forecasts, probabilities, analysis and recorded outcomes, through free and paid digital access.",
                "To provide subscription access to its own digital content and software tools, including tools for organizing and tracking information and selections.",
                "To license its own software and content, and provide related information technology, analytics and technical support services.",
                "To receive payment for its own goods and services through banks and authorised payment providers, and to do all other lawful things incidental or conducive to attaining these objects."
            ),
            p("The company shall obtain any permission required by law before carrying on an activity for which permission is required."),
            p("4. The liability of the member is limited."),
            p("5. The authorised capital of the company is UGX [CAPITAL_IN_FIGURES] ([CAPITAL_IN_WORDS] Uganda shillings), divided into [AUTHORISED_SHARE_COUNT] ordinary shares of UGX [NOMINAL_VALUE] each."),
            p("I, whose name, address and occupation appear below, wish to be formed into a company under this memorandum and agree to take the stated number of shares in its capital."),
            fields(
                ["Single member name", "[MEMBER_FULL_NAME]"],
                ["Physical and postal address", "[MEMBER_ADDRESSES]"],
                ["Occupation and shares taken", "[OCCUPATION]  [SUBSCRIBED_SHARE_COUNT] ordinary shares"],
                ["Member signature place and date", "__________________  [PLACE]  [DATE]"],
                ["Witness name occupation and address", "[WITNESS_NAME]  [OCCUPATION]  [ADDRESS]"],
                ["Witness signature and date", "__________________  [DATE]"],
            ),
        ),
        page(
            "Articles of association",
            p("Company: [COMPANY_NAME]"),
            p("A private Single Member Company limited by shares"),
            h("Adoption of the standard articles"),
            p("The company adopts, without modification, the articles of association contained in the First Schedule to the Companies (Single Member) Regulations, 2016, Statutory Instrument No. 72 of 2016, under regulation 5(2). Those articles apply subject to the Companies Act and applicable amendments."),
            p("No additional modifications are attached to this adoption."),
            h("Subscriber declaration"),
            p("I, the person whose name, address and occupation are set out below, wish to be formed into a company under these articles of association."),
            fields(
                ["Single member full name", "[MEMBER_FULL_NAME]"],
                ["Physical address", "[MEMBER_PHYSICAL_ADDRESS]"],
                ["Postal address", "[MEMBER_POSTAL_ADDRESS]"],
                ["Occupation", "[MEMBER_OCCUPATION]"],
                ["Member signature", "________________________________________"],
                ["Place and date", "[PLACE]  [DATE]"],
            ),
            h("Witness to the subscriber signature"),
            fields(
                ["Full name", "[WITNESS_FULL_NAME]"],
                ["Address", "[WITNESS_ADDRESS]"],
                ["Occupation", "[WITNESS_OCCUPATION]"],
                ["Witness signature", "________________________________________"],
                ["Date", "[DATE]"],
            ),
            p("The adoption method follows URSB's published lean SMC memorandum and articles model. Supply the current statutory schedule or official model if the registrar, bank or provider requests the complete articles. The source links are in 11 Official sources and filing map."),
        ),
    ),
    document(
        "01-registration/03-nominee-appointments-and-consents.docx",
        "Nominee appointments and consents",
        "Preparation for the official Single Member Company Form 1 under regulation 6",
        page(
            "Nomination by the single member",
            p("Transfer these details into the current official SMC Form 1 or the registrar's electronic equivalent. This editable preparation document does not replace the prescribed filing form."),
            fields(
                ["Company legal name", "[COMPANY_NAME]"],
                ["Company number and incorporation date", "[IF_ISSUED_OR_FOLLOW_PORTAL_INSTRUCTIONS]"],
                ["Single member full name", "[MEMBER_FULL_NAME]"],
                ["Member physical address", "[MEMBER_PHYSICAL_ADDRESS]"],
                ["Member occupation age and sex", "[OCCUPATION]  [AGE]  [SEX_AS_REQUIRED_BY_FORM]"],
            ),
            p("I nominate [NOMINEE_FULL_NAME] as nominee director and [ALTERNATE_FULL_NAME] as alternate nominee director for the statutory purposes of the Companies (Single Member) Regulations, 2016. The alternate acts in the circumstances provided by those Regulations."),
            h("Nominee director particulars"),
            fields(
                ["Full name", "[NOMINEE_FULL_NAME]"],
                ["Physical address", "[NOMINEE_PHYSICAL_ADDRESS]"],
                ["Occupation age and sex", "[OCCUPATION]  [AGE]  [SEX_AS_REQUIRED_BY_FORM]"],
                ["Telephone and email", "[PHONE]  [EMAIL]"],
            ),
            h("Alternate nominee director particulars"),
            fields(
                ["Full name", "[ALTERNATE_FULL_NAME]"],
                ["Physical address", "[ALTERNATE_PHYSICAL_ADDRESS]"],
                ["Occupation age and sex", "[OCCUPATION]  [AGE]  [SEX_AS_REQUIRED_BY_FORM]"],
                ["Telephone and email", "[PHONE]  [EMAIL]"],
            ),
            p("I confirm that the two nominees are different individuals and neither is the single member or company secretary. These appointments confer the statutory continuity role and do not allot shares or determine inheritance."),
            fields(["Single member signature", "____________________________"], ["Place and date", "[PLACE]  [DATE]"]),
        ),
        page(
            "Acceptance by the nominees",
            h("Consent of the nominee director"),
            p("I, [NOMINEE_FULL_NAME], consent to act as nominee director of [COMPANY_NAME] in the circumstances prescribed by the Companies (Single Member) Regulations, 2016, including following the death of the single member. I understand that this role does not itself make me the beneficial owner of the shares."),
            p("I confirm that I am neither the single member nor the company secretary. I agree to provide the identity and contact details lawfully required for this appointment."),
            fields(
                ["Nominee director signature", "________________________________"],
                ["Date", "[DATE]"],
            ),
            h("Consent of the alternate nominee director"),
            p("I, [ALTERNATE_FULL_NAME], consent to act as alternate nominee director of [COMPANY_NAME] when the statutory circumstances for the alternate to act arise. I understand that this role does not itself make me the beneficial owner of the shares."),
            p("I confirm that I am neither the single member nor the company secretary and am a different person from the nominee director. I agree to provide the identity and contact details lawfully required for this appointment."),
            fields(
                ["Alternate nominee director signature", "________________________________"],
                ["Date", "[DATE]"],
            ),
            h("Filing check"),
            bullets(
                "Use the current official consent wording in the prescribed form, including the conditions for the alternate to act.",
                "Check both nominee names against their identity documents and obtain both actual signatures.",
                "File the nomination at incorporation as required and retain the official acknowledgement.",
                "Keep nominee records current. Arrange lawful succession and estate instructions separately."
            ),
        ),
    ),
    document(
        "01-registration/04-member-and-beneficial-ownership-register.docx",
        "Member and beneficial ownership register",
        "Complete after confirming the ownership facts and keep at the registered office",
        page(
            "Register of the member",
            fields(
                ["Company name and number", "[COMPANY_NAME]  [COMPANY_NUMBER]"],
                ["Registered office and register creation date", "[REGISTERED_OFFICE]  [REGISTER_CREATION_DATE]"],
                ["Member full name", "[MEMBER_FULL_NAME]"],
                ["Physical and postal addresses", "[MEMBER_ADDRESSES]"],
                ["Date entered as member", "[DATE]"],
                ["Share class and number held", "Ordinary  [ISSUED_SHARES_HELD]"],
                ["Distinctive share numbers if applicable", "[FROM] to [TO]"],
                ["Nominal value per share", "UGX [VALUE]"],
                ["Total amount paid and unpaid", "UGX [PAID]  UGX [UNPAID]"],
                ["Percentage of issued shares and votes", "[SHARE_PERCENT] percent  [VOTE_PERCENT] percent"],
                ["Share certificate reference", "[CERTIFICATE_REFERENCE]"],
                ["Date ceased to be member", "[IF_APPLICABLE]"],
            ),
            h("Ownership confirmation"),
            p("I confirm that the register accurately records the member and the issued shares as at [DATE]. All issued shares of this Single Member Company are held by the single member. The ultimate beneficial owners and other controllers are separately recorded on the next page."),
            fields(
                ["Director name", "[DIRECTOR_FULL_NAME]"],
                ["Director signature and date", "____________________________  [DATE]"],
            ),
            p("Maintain supporting allotment, payment and transfer records. A share certificate is a company record; this template is not a government certificate."),
        ),
        page(
            "Register of beneficial owners",
            p("Complete one record for each natural person with ultimate ownership or control, including control exercised through another arrangement. A legal shareholder and beneficial owner can differ. Do not leave other controllers undisclosed merely because the company has one registered member."),
            fields(
                ["Company name and register reference", "[COMPANY_NAME]  [REGISTER_REFERENCE]"],
                ["Beneficial owner full and former names", "[FULL_NAME]  [FORMER_NAMES_OR_NONE]"],
                ["Date of birth nationality and sex", "[DATE_OF_BIRTH]  [NATIONALITY]  [SEX_AS_REQUIRED]"],
                ["ID or passport particulars", "[DOCUMENT_TYPE_NUMBER_AND_COUNTRY]"],
                ["Residential and postal addresses", "[ADDRESSES]"],
                ["Service address and occupation", "[SERVICE_ADDRESS]  [OCCUPATION]"],
                ["Telephone email and tax reference", "[PHONE]  [EMAIL]  [TIN_IF_REQUIRED]"],
                ["Date beneficial interest began", "[DATE]"],
                ["Nature of ultimate ownership or control", "[DIRECT_INDIRECT_SHARES_VOTES_APPOINTMENT_OR_OTHER_CONTROL]"],
                ["Percentage or extent of interest", "[SHARES] percent  [VOTES] percent  [OTHER_EXTENT]"],
                ["Other person with ultimate control", "[DETAILS_OR_NONE_AFTER_CHECKING]"],
                ["Date interest ceased or changed", "[IF_APPLICABLE]"],
                ["Evidence verification and entry date", "[EVIDENCE]  [VERIFIED_BY]  [DATE]"],
            ),
            p("I confirm the ownership and control particulars above and agree to notify the company when they change."),
            fields(
                ["Beneficial owner signature and date", "____________________________  [DATE]"],
                ["Company filing reference and date", "[OFFICIAL_ACKNOWLEDGEMENT_REFERENCE]  [DATE]"],
            ),
            p("Use the registrar's current beneficial ownership return or electronic process in addition to this internal record. URSB's published notice requires notification within 14 days of creating the register. Check the current rule and portal requirements for subsequent changes. Keep private identity records secure and retain filing evidence."),
        ),
    ),
    document(
        "02-banking-and-payments/05-company-profile.docx",
        "Goal Hint company profile",
        "For registration and merchant due diligence | Complete all company particulars before use",
        page(
            "Company and service",
            fields(
                ["Legal entity and brand", "[COMPANY_NAME]  |  Goal Hint"],
                ["Registration number date and TIN", "[COMPANY_NUMBER]  [INCORPORATION_DATE]  [COMPANY_TIN]"],
                ["Registered office", "[REGISTERED_OFFICE]"],
                ["Website and support contact", "https://goalhint.com  |  [SUPPORT_EMAIL]  [SUPPORT_PHONE]"],
                ["Director and authorised representative", "[DIRECTOR_FULL_NAME]"],
            ),
            p(BUSINESS_DESCRIPTION),
            h("Customers and revenue"),
            p("The intended audience is adult football information users aged 18 and over. Revenue comes from the company's own information subscriptions and related digital services. Current initial subscription offers in the application are Daily UGX 1,000, Weekly UGX 5,000 and Monthly UGX 20,000; confirm the live catalogue before submission. Target countries and forecast volumes: [CONFIRM_COUNTRIES_AND_VOLUMES]."),
            h("Features relevant to the provider"),
            p("The software includes sports forecasts, selection combinations, probability and odds related tools and outcome tracking. A saved selection slip records information; it does not submit a bet. Fees are not pooled stakes and the service does not award gambling winnings. These actual sports information features are part of the service description."),
            p("The application also implements prepaid service credits from approved top-ups and overpayments. Credit is intended for Goal Hint plans only, with optional balance-funded renewal. It is not transferable between customers and has no ordinary withdrawal or interest feature. Lawful refunds are handled separately. Production status of these features: [CONFIRM_ENABLED_FEATURES]. The payment provider is asked to assess the disclosed credit model."),
            h("Payments and current status"),
            p("Current repository functionality uses manually reviewed mobile money reports. Production Collections API access is being requested; no existing API authorisation is claimed. Proposed settlement is to [COMPANY_BANK_ACCOUNT_OR_APPROVED_MERCHANT_ACCOUNT], held in the company's name. The company seeks collections for its own services and will use the channels, limits and feature scope accepted by its providers."),
            fields(["Confirmed by director", "[NAME]  Signature: __________________  Date: [DATE]"]),
        ),
    ),
    document(
        "02-banking-and-payments/06-company-resolutions.docx",
        "Company written resolutions",
        "Execute after incorporation using the approved company name and actual dates",
        page(
            "Written decision of the single member",
            fields(["Company name and registration number", "[COMPANY_NAME]  [COMPANY_NUMBER]"], ["Date and place of decision", "[DATE]  [PLACE]"]),
            p("I, [MEMBER_FULL_NAME], being the single member holding all issued shares of the company, record the following decisions in writing:"),
            p("1. The company records its issued shareholding, beneficial ownership details and the incorporation records in the company books. Any share issue or payment recorded must match the actual incorporation and allotment records."),
            p("2. The business will develop and supply software and football information subscriptions in accordance with its constitution and applicable law. Subscription receipts pay for the company's information and digital services."),
            p("3. [DIRECTOR_FULL_NAME] shall act as director consistently with the official appointment record. The nominee and alternate nominee appointments remain those filed with URSB and do not create share ownership."),
            p("4. Secretary decision: [NO_SECRETARY_APPOINTED / APPOINT_FULL_NAME_SUBJECT_TO_CONSENT_AND_REQUIRED_FILING]. Delete the unused choice. The sole director shall not act as company secretary."),
            p("5. The director is authorised to obtain the company TIN, complete statutory filings, seek applicable local trading permission, and arrange company banking and merchant collections within the company's lawful activities."),
            p("6. This written decision shall be delivered to the company for entry in its minute book within three days of the decision, in accordance with the standard SMC articles. Required filings shall use the registrar's current forms."),
            fields(
                ["Single member full name", "[MEMBER_FULL_NAME]"],
                ["Signature", "________________________________________"],
                ["Date signed", "[DATE]"],
                ["Minute book entry and delivery date", "[REFERENCE]  [DATE]"],
            ),
        ),
        page(
            "Director resolution for banking and merchant collections",
            fields(["Company name and registration number", "[COMPANY_NAME]  [COMPANY_NUMBER]"], ["Resolution date and reference", "[DATE]  [RESOLUTION_REFERENCE]"]),
            p("I, [DIRECTOR_FULL_NAME], acting as sole director, resolve that:"),
            p("1. The company shall open and operate a [ACCOUNT_TYPE_AND_CURRENCY] account with [BANK_NAME], [BRANCH]. Its title shall be the company's exact registered name. The account shall receive revenue, settle operating expenses and receive approved payment-provider settlements."),
            p("2. The authorised signatory or signatories are [FULL_NAMES_AND_ID_REFERENCES]. The signing mandate is [SOLE_SIGNATORY / JOINT_MANDATE_WITH_DETAILS]. Approved transaction and online banking limits are [LIMITS]. Delete unused options."),
            p("3. [AUTHORISED_REPRESENTATIVE] is authorised to submit bank and KYC documents, arrange online banking and apply for MTN MoMo and Airtel Money merchant Collections API access and any further approved payment gateway for the company's own service sales."),
            p("4. The representative may complete onboarding and sign provider merchant agreements within [AUTHORITY_LIMITS]. Production payment channels and the service-credit feature shall operate only within the lawful scope accepted by the relevant provider. The representative must disclose the actual sports information service and account-credit model."),
            p("5. Settlement shall be to [COMPANY_SETTLEMENT_ACCOUNT_DETAILS], subject to the bank and provider mandate. Refunds shall follow the approved customer policy and provider process; this resolution does not authorise general remittance or third-party payment aggregation."),
            p("6. The company will protect access credentials, maintain transaction and refund records, reconcile receipts and settlements, and notify institutions of changes in signatories or ownership as required."),
            fields(
                ["Sole director full name", "[DIRECTOR_FULL_NAME]"],
                ["Director signature and date", "____________________________  [DATE]"],
                ["Company record reference", "[MINUTE_BOOK_REFERENCE]"],
            ),
            p("Use the bank's own resolution and mandate form if required. Obtain genuine certification or registry filing where the receiving institution requires it. This editable resolution is not already certified. If the company has additional directors, use its actual board procedure and the required signatures instead of the sole-director wording."),
        ),
    ),
    document(
        "02-banking-and-payments/07-bank-and-api-application-letters.docx",
        "Bank and payment application letters",
        "Three separate letters | Complete and sign only the letter being submitted",
        page(
            "Application for a company bank account",
            fields(["From", "[COMPANY_NAME]  [REGISTERED_OFFICE]"], ["Contact", "[COMPANY_EMAIL]  [COMPANY_PHONE]"], ["Date", "[DATE]"], ["To", "The Business Banking Manager, [BANK_NAME], [BRANCH]"]),
            p("Dear Sir or Madam,"),
            p("Please open a [ACCOUNT_TYPE] account in Uganda shillings in the name of [COMPANY_NAME], registration number [COMPANY_NUMBER], incorporated on [INCORPORATION_DATE], TIN [COMPANY_TIN]."),
            p(BUSINESS_DESCRIPTION),
            p("We intend to receive our own service revenue and settlements from approved mobile money or online payment providers. Our source of initial funds is [SOURCE], and our estimated monthly receipts are UGX [ESTIMATE]. Customer countries and major expected counterparties are [DETAILS]. These are estimates unless marked as actual."),
            p("Our software includes prepaid credits usable only for our own plans, funded by approved top-ups or overpayments, and optional renewal from credit. Current production status is [CONFIRM]. Please advise on any due diligence or account conditions relevant to that feature."),
            p("The authorised signatories and operating mandate are set out in the enclosed director resolution. Please confirm your current requirements for certification, introductions, the company's registered office and director records, and any applicable trading permission."),
            h("Documents enclosed as available"),
            bullets("Incorporation certificate; memorandum and articles; director and registered office particulars.", "Company TIN; member and beneficial owner identification; address evidence; applicable trading licence or explanation.", "Signed resolution and mandate; company profile; any additional bank forms or certified copies requested."),
            p("Yours faithfully,"),
            fields(["Director name and signature", "[DIRECTOR_FULL_NAME]  ____________________________"]),
        ),
        page(
            "Application for MTN MoMo Collections API access",
            fields(["From", "[COMPANY_NAME]  [REGISTERED_OFFICE]"], ["Contact and date", "[COMPANY_EMAIL]  [COMPANY_PHONE]  [DATE]"], ["To", "MTN MoMo Uganda Merchant and Open API Onboarding Team"]),
            p("Dear Onboarding Team,"),
            p("We request Uganda production Collections API onboarding for [COMPANY_NAME], registration [COMPANY_NUMBER], TIN [COMPANY_TIN], to receive UGX payments for our own Goal Hint digital subscriptions."),
            p(BUSINESS_DESCRIPTION),
            p("The product includes sports forecasts, odds related selection tools and recorded outcomes. The payment buys information access. The application also implements plan-only credit funded by approved top-ups or overpayments, and optional renewal from that balance. It does not provide ordinary customer-to-customer transfers or cash withdrawals. Please assess this credit feature as part of our merchant application; its production status is [CONFIRM]."),
            p("We currently have a manual payment-review workflow. We seek approval to integrate Collections, subject to sandbox testing, KYC, contracts and technical acceptance. Our website is https://goalhint.com and our proposed settlement account is [COMPANY_ACCOUNT]."),
            fields(
                ["Expected monthly transaction count and value", "[ESTIMATED_COUNT]  UGX [ESTIMATED_VALUE]"],
                ["Average and maximum transaction value", "UGX [AVERAGE]  UGX [MAXIMUM]"],
                ["Production products and countries requested", "Collections  |  Uganda  |  UGX"],
                ["Technical and customer support contacts", "[TECHNICAL_EMAIL]  [SUPPORT_EMAIL]  [PHONE]"],
            ),
            p("Please provide the current Uganda KYC checklist, merchant category and eligibility decision, production integration requirements, settlement and refund terms, charges and limits. We enclose the available incorporation, constitutional, TIN, director, ownership, address and mandate records, company profile, payment flow and customer policies. Please identify any additional documents or permissions required for our disclosed service."),
            p("Yours faithfully,"),
            fields(["Authorised director name and signature", "[DIRECTOR_FULL_NAME]  ____________________________"]),
        ),
        page(
            "Application for Airtel Money merchant and API access",
            fields(["From", "[COMPANY_NAME]  [REGISTERED_OFFICE]"], ["Contact and date", "[COMPANY_EMAIL]  [COMPANY_PHONE]  [DATE]"], ["To", "Airtel Money Uganda Merchant and API Onboarding Team"]),
            p("Dear Onboarding Team,"),
            p("We request formal merchant onboarding and the separate approval needed for Uganda production Collections API access for [COMPANY_NAME], registration [COMPANY_NUMBER], TIN [COMPANY_TIN]. We will collect UGX payments for our own Goal Hint information subscriptions."),
            p(BUSINESS_DESCRIPTION),
            p("Sports forecasts, odds related selection tools and recorded prediction outcomes are disclosed product features. Our software also includes plan-only prepaid credit from approved top-ups and overpayments, with optional balance-funded renewal. It provides no ordinary customer-to-customer transfer or cash withdrawal facility. Please review this model; the credit feature's production status is [CONFIRM]."),
            p("Our current payment process is manual review. The proposed API integration and production collections will follow your required onboarding, technical tests and contracts. The website is https://goalhint.com and settlement is proposed to [COMPANY_BANK_ACCOUNT], subject to your approved mandate."),
            fields(
                ["Estimated monthly transactions and value", "[COUNT]  UGX [VALUE]"],
                ["Average and maximum transaction value", "UGX [AVERAGE]  UGX [MAXIMUM]"],
                ["Technical and support contacts", "[TECHNICAL_EMAIL]  [SUPPORT_EMAIL]  [PHONE]"],
            ),
            p("We enclose available incorporation, memorandum and articles, TIN, director and office records, IDs, trading permission, resolution, profile, payment flow and customer policies. Where a checklist uses legacy Forms 18 or 20, please confirm acceptance of the current equivalent office and director records."),
            p("Please confirm merchant eligibility, API-specific KYC and integration requirements, settlement instructions, charges, limits and refund arrangements. We understand that a merchant code alone does not establish production API approval."),
            p("Yours faithfully,"),
            fields(["Authorised director name and signature", "[DIRECTOR_FULL_NAME]  ____________________________"]),
        ),
    ),
    document(
        "02-banking-and-payments/08-payment-operations-and-disclosures.docx",
        "Payment operations and merchant disclosures",
        "For provider review and owner approval | Proposed API flow is not yet a live integration",
        page(
            "Business model and the current payment flow",
            p("Goal Hint collects payment for its own football information subscriptions. It does not accept stakes, submit customers' bets, pool betting money or pay gambling winnings. Its forecasts and odds related tools remain part of the disclosed information product."),
            h("Current repository functionality"),
            bullets(
                "A customer chooses an available plan and pays using the displayed MTN or Airtel payment instructions.",
                "The customer reports the transaction ID and payer number and may attach a receipt image. An administrator verifies the actual receiving transaction and payer details before approving access.",
                "The application records the decision and access period. Receipt images and customer-entered references alone do not establish successful payment.",
                "The repository's public terms describe a prelaunch state. Confirm actual deployment, paid-sales status, receiving account ownership and enabled features before submitting this flow as live."
            ),
            h("Service credits must be disclosed"),
            p("Implemented credit features include approved top-ups of UGX 1,000 to UGX 500,000, excess plan payments recorded as credit, immediate plan purchases from credit and optional renewal from credit. Confirm current limits before submission. Credit is intended for Goal Hint plans only; it cannot ordinarily be transferred to another customer, withdrawn as cash or earn interest. Refunds required by law or agreed by the provider are a separate process."),
            p("A verified change of a customer's own phone number can move the same customer's account credit; it is not a customer-to-customer transfer. Reversals can leave a negative credit balance if the reversed credit was spent. The provider should review these rules and the applicable consumer policy before approving real-money use."),
            fields(
                ["Credit enabled in the proposed live service", "[YES_NO_AND_FEATURE_DETAILS]"],
                ["Actual transaction and balance limits", "[LIMITS]"],
                ["Provider acceptance or scope clarification", "[PROVIDER_DATE_REFERENCE_OR_PENDING]"],
            ),
            p("A simpler direct-plan-payment-only launch is an option for the owner to consider. It would require actual changes to disable top-ups, surplus credit and balance renewal consistently before describing that flow to a provider. It is not the current implemented model and this package does not change the application."),
        ),
        page(
            "Proposed production API collection process",
            p("The following process is a proposed control standard for integration after the merchant and production product are approved. It must be implemented and tested before the company claims it operates this way."),
            bullets(
                "Show the exact legal seller, plan, price in UGX, access duration, renewal choice, support details and cancellation or refund policy before the customer confirms.",
                "Create a unique server-side payment reference linked to the customer and plan or approved credit purpose. Store the expected amount and currency.",
                "Send the collection request through the approved provider. The customer authorises payment in the provider's own trusted flow. Goal Hint must never request a mobile money PIN or OTP by chat or support message.",
                "Treat timeouts and pending responses as pending. Verify authoritative provider status, amount, currency, reference and destination before granting access or credit.",
                "Process each provider transaction once. Verify callbacks as required by the provider, handle retries safely and reconcile uncertain responses before retrying a charge.",
                "Grant access or credit only on verified success. Record the order, provider transaction, fee, settlement, access decision, ledger entry where applicable and customer notification.",
                "Reconcile provider receipts, company balances and bank settlements regularly. Escalate mismatches and unresolved payments to the provider; do not ask a customer to pay again solely because a response timed out.",
                "Handle refunds and reversals using the provider's authorised process. Verify the payer and original payment, prevent duplicate refunds, adjust affected access and credit fairly, and preserve audit evidence."
            ),
            h("Settlement and accountability"),
            fields(
                ["Legal merchant and settlement account", "[COMPANY_NAME]  [ACCOUNT_DETAILS]"],
                ["Owner of reconciliation and review frequency", "[RESPONSIBLE_PERSON]  [FREQUENCY]"],
                ["Customer complaints contact", "[SUPPORT_EMAIL]  [SUPPORT_PHONE]"],
                ["Refund approver and limits", "[NAME_ROLE]  [LIMITS]"],
                ["Incident escalation contact", "[INTERNAL_CONTACT_AND_PROVIDER_CHANNEL]"],
            ),
            p("A separate bank or regulated gateway may provide other payment channels, subject to its Uganda availability, current authorisation and merchant acceptance. Request its written channel, currency, charge, refund and settlement terms before advertising availability."),
        ),
        page(
            "Provider submission and approval checklist",
            table(
                ["Area", "Supply or confirm"],
                [
                    ["Entity", "Incorporation, constitution, current director and office records, TIN"],
                    ["People", "Authorised representative, directors, owners and controllers; secure KYC records"],
                    ["Operating permission", "Applicable trading licence and any additional permission requested for the disclosed activity"],
                    ["Banking", "Company account confirmation, resolution, mandate and approved settlement details"],
                    ["Product", "Working website, honest sports information profile, plan prices and credit features"],
                    ["Customer rights", "Approved terms, refunds, cancellation, support contact and privacy notice"],
                    ["Forecast volumes", "Clearly estimated monthly count/value, average and maximum charge, customer countries"],
                    ["Technical readiness", "Sandbox results, security controls, callback and status handling, reconciliation tests"],
                    ["Production permission", "Completed KYC and contracts; approved countries, products, limits and live credentials"],
                ],
                [1.45, 5.35],
            ),
            h("Distinguish the approvals"),
            p("URSB incorporation establishes the legal entity. It does not grant a payment services licence or guarantee a merchant account. A developer sandbox account is for testing; a merchant code and a production API product can require different approvals."),
            p("The Bank of Uganda's 2025 oversight framework discusses instruments restricted to a single payee type or specified use, including some closed-loop schemes. This is relevant background for plan-only credit, not an exemption decision for Goal Hint. Seek the provider's written assessment of the actual credit flow and a Bank of Uganda scope clarification if the classification remains uncertain."),
            h("Record the decision before using real money"),
            fields(
                ["Provider product and country", "[PROVIDER]  [PRODUCT]  Uganda"],
                ["Approved collection and credit scope", "[SCOPE_AND_LIMITS]"],
                ["Approval or agreement reference and date", "[REFERENCE]  [DATE]"],
                ["Test acceptance and production activation", "[EVIDENCE_REFERENCE]  [ACTIVATION_DATE]"],
                ["Director approval", "[NAME]  Signature: __________________  Date: [DATE]"],
            ),
        ),
    ),
]


SOURCES = [
    ("URSB company fees", "https://ursb.go.ug/business-company-and-document-registration-fees/", "Published reservation and incorporation tariffs; confirm current official assessment and additional charges."),
    ("URSB business registration forms", "https://ursb.go.ug/business-registration-forms/", "Find the current official filings rather than treating the preparation sheets as prescribed forms."),
    ("URSB lean SMC memorandum and articles", "https://ursb.go.ug/wp-content/uploads/2025/01/single-member-company-lean-memarts-1661925606.pdf", "Model for the editable memorandum and adoption without modification of the statutory SMC articles."),
    ("URSB standard SMC articles", "https://ursb.go.ug/wp-content/uploads/2025/01/single-member-company-articles-1661926020.pdf", "Standard company governance, member director, optional secretary and written decision requirements."),
    ("URSB SMC nominee Form 1", "https://ursb.go.ug/wp-content/uploads/2025/01/notice-of-nomination-of-nominee-director-and-alternate-nominee-director-by-single-member-1639049007.pdf", "Nominee and alternate particulars and actual consents. Use the current form accepted by the registrar."),
    ("URSB explanation of Single Member Companies", "https://ursb.go.ug/wp-content/uploads/2025/05/newsletter-june-2018.pdf", "Distinguishes the sole member, nominees and succession; not automatic inheritance by a secretary."),
    ("Companies Regulations 2023", "https://ursb.go.ug/wp-content/uploads/2026/02/The-Companies-Regulations-2023.pdf", "Current numbering includes Form 21 for office particulars and Form 23 for director or secretary appointment. Institutional checklists may still use older numbers."),
    ("URSB beneficial ownership notice", "https://ursb.go.ug/storage/publications/downloads/requirement-to-submit-beneficial-ownership-information-1673425355.pdf", "Internal beneficial ownership register and notification within 14 days of creating it; check current change filings."),
    ("URA TIN application", "https://ura.go.ug/en/domestic-taxes/tin-application/", "Company tax registration, required evidence and free TIN issuance."),
    ("URA business formalisation", "https://ura.go.ug/en/business-formalisation/", "Incorporation, tax registration and local trading permission are separate steps."),
    ("Government PDPO registration checklist", "https://doingbusiness.finance.go.ug/licensing/pdpo-data-protection-registration", "Registration application, fee, renewal and supporting information about personal data processing."),
    ("MTN Uganda Open API", "https://www.mtn.co.ug/helppersonal/mtn-open-api/", "Distinguishes Collections, Disbursements and Remittances. Goal Hint seeks collections for own-service sales."),
    ("MTN official production onboarding guidance", "https://momodevelopercommunity.mtn.com/getting-started-in-the-community-2/open-a-business-account-with-momo-from-mtn-232", "Sandbox tests, GoLive, country-specific KYC and contract process; obtain Uganda's current checklist."),
    ("MTN GoLive", "https://momodeveloper.mtn.com/golive", "Provider entry point for production application, not an existing approval."),
    ("Airtel Money Uganda merchant FAQs 2026", "https://cdn-webportal.airtelstream.net/website/uganda/assets/pdf/Airtel-Money-Pay-Merchant-FAQs-2026.pdf", "Formal merchant evidence includes incorporation, constitution, director and office records, licence or equivalent, IDs and TIN. Merchant-code onboarding differs from API approval."),
    ("Airtel Africa developer portal", "https://developers.airtel.africa/", "Developer application, country and product onboarding. Confirm Uganda's live API conditions directly."),
    ("Bank of Uganda oversight framework 2025", "https://bou.or.ug/uploads/Revised_BOU_National_Payment_Systems_Oversight_Framework_2025_698b3e9745.pdf", "Payment-service perimeter and restricted-use instruments, printed page 9; does not classify Goal Hint's implementation."),
    ("Equity Uganda business current account", "https://equitygroupholdings.com/ug/open-an-account/business-current-account", "Example company-account due diligence; selected banks may require different certification and mandate forms."),
    ("Example gateway Uganda onboarding", "https://www.flutterwave.com/us/support/onboarding/onboarding-requirements-for-using-flutterwave-in-uganda", "Example entity and settlement evidence for broader online channels. Verify current Uganda channels, authorisation and acceptance before choosing a gateway."),
    ("NITA electronic transactions consumer guidance", "https://oldsite.nita.go.ug/electronic-transactions-act-2011", "Electronic seller disclosures and consumer cancellation and refund rights, subject to the Act's scope and exceptions."),
    ("Personal Data Protection Office", "https://pdpo.go.ug/", "Current data protection registration, privacy and complaints guidance."),
    ("Data Protection and Privacy Act 2019", "https://ict.go.ug/site/documents/Data-Protection-and-Privacy-Act-2019.pdf", "Official legal text for personal-data handling, lawful processing grounds and the rights addressed in the proposed privacy notice."),
    ("NLGRB published Lotteries and Gaming Act", "https://lgrb.go.ug/download/lotteries-and-gaming-act-2016/", "Background for a scope clarification if requested. The information-service description is factual and does not claim a blanket licensing exemption."),
]


def sources_document():
    pages = [page(
        "Filing map and continuing responsibilities",
        p("This package was prepared for Uganda using the supplied WhatsApp conversation of 21 October 2026, Goal Hint's repository service descriptions and the official sources below, checked on 26 October 2026. Missing identity and corporate facts have been left for completion. No registration or payment application has been submitted."),
        h("Official forms and certificates"),
        bullets(
            "Use URSB's current OBRS or official process for the incorporation application, nominal capital, registered office and director particulars. Prepare the SMC nominee Form 1 separately as required. The 2023 Regulations use Form 21 for office and Form 23 for director or secretary appointment; providers may still ask for legacy Forms 18 and 20. Confirm the equivalent by document purpose.",
            "The editable memorandum and standard-articles adoption follow URSB's lean SMC model. Request the official schedule as an attachment where the registrar or bank requires full printed articles. Do not add bespoke articles unless needed.",
            "URSB must issue the incorporation certificate. URA must issue the company TIN. Official certified copies, notarisation or certification must be obtained from the appropriate institution or qualified person when required.",
            "The internal ownership register does not replace the official beneficial ownership return. Obtain and keep an acknowledgement of the prescribed filing.",
            "Airtel's published checklist concerns a merchant account and contains old form numbers. MTN production documentation depends on country and entity type. Ask each provider for its current Uganda API checklist."
        ),
        h("After incorporation"),
        bullets(
            "Keep the member, director, nominee, office, beneficial ownership and minute records current; make change filings and annual returns when due under the current rules. Record actual due dates with URSB or the filing agent.",
            "Maintain proper accounts and payment records; establish applicable tax registrations, filing dates and invoices with URA. Add payroll and employment obligations when staff are engaged.",
            "Confirm local trading permission for the actual premises. Address PDPO registration and renewal for the platform's personal-data activities, and implement its privacy and cross-border requirements.",
            "Confirm rights to use third-party football data, logos and reporting in paid content. A data subscription or attribution alone may not establish all commercial reuse rights.",
            "Keep provider contracts, settlement and refund records, periodic KYC updates and evidence of production authorisation. Match website policies and payment screens to the approved live service."
        ),
        fields(["Person responsible for filings", "[NAME_AND_CONTACT]"], ["Next review and actual filing due dates", "[REVIEW_DATE]  [DUE_DATES_CONFIRMED_WITH_AUTHORITY]"]),
    )]
    for start, end in [(0, 8), (8, 15), (15, len(SOURCES))]:
        blocks = []
        for title, url, explanation in SOURCES[start:end]:
            blocks += [h(title), p(explanation), {"type": "reference", "title": "Open official source", "url": url}]
        pages.append(page("Official sources", *blocks))
    return document("00-guidance/11-official-sources-and-filing-map.docx", "Official sources and filing map", "Uganda | Requirements checked 26 October 2026", *pages)


DOCUMENTS.append(sources_document())
