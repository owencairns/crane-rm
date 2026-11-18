import {
  PDFCheckBox,
  PDFDocument,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
  type PDFField,
  type PDFFont,
} from "pdf-lib";
import { resolveCertificateHolder, resolveNamedInsured } from "../schemas/acord25";
import { acord25TemplateBase64 } from "./acord25Template";
import { buildCertRemarks, formOtherCoverage, isPropertyCoverage } from "./remarks";
import type { CertRequirements } from "./schema";

/*
 * Fills Red Cedar's ACORD 25 (2016/03) template from contract requirements.
 *
 * The output is an EXAMPLE: every limit is the contract minimum ("AT LEAST
 * $X"), policy numbers/dates/carriers are placeholders, and every page is
 * watermarked so it can't pass as an issued certificate.
 *
 * Field notes (from the template's AcroForm):
 * - ADDL INSD and SUBR WVD are TEXT fields that take "Y", not checkboxes.
 * - Gen'l aggregate applies per POLICY / PROJECT / LOC are checkboxes.
 */

const P = "F[0].P1[0].";

// Red Cedar's producer block, as printed on certificates it issues.
const PRODUCER = {
  name: "Red Cedar Insurance Agency",
  line1: "855 Jefferson Ave #2669",
  city: "Redwood City",
  state: "CA",
  postalCode: "94063",
  contact: "Red Cedar Insurance Agency",
  phone: "844-733-2332",
  email: "certificates@redcedaragency.com",
};

const PLACEHOLDER_POLICY = "[POLICY #]";
const PLACEHOLDER_DATE = "[MM/DD/YYYY]";
const PLACEHOLDER_NAIC = "[NAIC]";
const PLACEHOLDER_INSURED = "[NAMED INSURED]";

export const EXAMPLE_NOTICE =
  "EXAMPLE ONLY, NOT AN ISSUED CERTIFICATE. Limits shown are the MINIMUMS the contract requires, not coverage in force. Complete insurers, policy numbers and dates from the actual policies before issuing.";

const SHORT_NOTICE = "EXAMPLE ONLY. Limits shown are contract minimums, not coverage in force.";
const MIN_REMARKS_SIZE = 6;

function wrapLines(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** Page 2: additional remarks schedule carrying the full wording. */
function drawRemarksPage(
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  req: CertRequirements,
  remarks: string,
) {
  const first = doc.getPage(0);
  const { width, height } = first.getSize();
  const page = doc.addPage([width, height]);
  const left = 40;
  const textWidth = width - left * 2;
  let y = height - 50;
  const line = (text: string, f: PDFFont, size: number, gap = 1.35) => {
    page.drawText(text, { x: left, y, size, font: f, color: rgb(0, 0, 0) });
    y -= size * gap;
  };
  line("ADDITIONAL REMARKS SCHEDULE", bold, 13, 1.6);
  line("This page is attached to and part of the ACORD 25 certificate on page 1.", font, 8.5, 2);
  const insured = resolveNamedInsured(req).name ?? PLACEHOLDER_INSURED;
  const holder = resolveCertificateHolder(req).name ?? "[CERTIFICATE HOLDER]";
  line(`NAMED INSURED: ${insured}`, bold, 9);
  line(`CERTIFICATE HOLDER: ${holder}`, bold, 9, 2.2);
  page.drawLine({
    start: { x: left, y: y + 8 },
    end: { x: width - left, y: y + 8 },
    thickness: 0.75,
    color: rgb(0, 0, 0),
  });
  y -= 6;
  line("DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES", bold, 9, 1.8);
  for (const l of wrapLines(remarks, font, 9.5, textWidth)) line(l, font, 9.5, 1.4);
}

function formatMinLimit(n: number | null | undefined): string | undefined {
  if (n === null || n === undefined) return undefined;
  return `AT LEAST $${n.toLocaleString("en-US")}`;
}

function todayMDY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function base64ToUint8Array(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Greedy word wrap; returns the number of lines `text` needs at `size`. */
function wrappedLineCount(text: string, font: PDFFont, size: number, width: number): number {
  let count = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      count++;
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
      else {
        count++;
        line = word;
      }
    }
    count++;
  }
  return count;
}

export async function fillAcord25(req: CertRequirements): Promise<Uint8Array> {
  const doc = await PDFDocument.load(base64ToUint8Array(acord25TemplateBase64));
  const form = doc.getForm();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const byName = new Map<string, PDFField>();
  for (const f of form.getFields()) byName.set(f.getName(), f);

  const fieldRect = (f: PDFTextField) => {
    const widget = f.acroField.getWidgets()[0];
    return widget?.getRectangle() ?? { width: 0, height: 0, x: 0, y: 0 };
  };

  /** Set a single-line field, shrinking the font until the value fits. */
  const setText = (name: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    const f = byName.get(P + name);
    if (!(f instanceof PDFTextField)) return;
    const str = String(value);
    try {
      const { width, height } = fieldRect(f);
      if (width > 0 && !f.isMultiline()) {
        let size = Math.min(9, Math.max(5, height - 3));
        while (size > 4 && helvetica.widthOfTextAtSize(str, size) > width - 4) size -= 0.25;
        f.setFontSize(size);
      }
      f.setText(str);
    } catch {
      // field rejects the value (max length etc.); skip
    }
  };

  /** Largest font size (down to 4pt) at which `value` fits the field. */
  const fitSize = (f: PDFTextField, value: string, maxSize: number) => {
    const { width, height } = fieldRect(f);
    let size = maxSize;
    while (
      size > 4 &&
      wrappedLineCount(value, helvetica, size, width - 6) * size * 1.18 > height - 4
    ) {
      size -= 0.25;
    }
    return size;
  };

  /** Set a multiline field, shrinking the font until the wrapped text fits. */
  const setMultiline = (name: string, value: string, maxSize = 8) => {
    const f = byName.get(P + name);
    if (!(f instanceof PDFTextField) || !value) return;
    f.setFontSize(fitSize(f, value, maxSize));
    f.setText(value);
  };

  // Checkboxes are drawn as X marks after flattening: pdf-lib's flatten
  // mangles the template's checkbox appearance streams and they disappear.
  const checked = new Set<string>();
  const check = (name: string, on: boolean | undefined) => {
    if (on) checked.add(P + name);
  };

  /** ADDL INSD / SUBR WVD columns are text fields that take "Y". */
  const yes = (name: string, on: boolean | undefined) => {
    if (on) setText(name, "Y");
  };

  const c = req.coverages;
  const formOther = formOtherCoverage(req);
  const usesA = c.generalLiability.required || c.autoLiability.required || !!formOther;

  // ── Header and producer ──
  setText("Form_CompletionDate_A[0]", todayMDY());
  setText("Producer_FullName_A[0]", PRODUCER.name);
  setText("Producer_MailingAddress_LineOne_A[0]", PRODUCER.line1);
  setText("Producer_MailingAddress_CityName_A[0]", PRODUCER.city);
  setText("Producer_MailingAddress_StateOrProvinceCode_A[0]", PRODUCER.state);
  setText("Producer_MailingAddress_PostalCode_A[0]", PRODUCER.postalCode);
  setText("Producer_ContactPerson_FullName_A[0]", PRODUCER.contact);
  setText("Producer_ContactPerson_PhoneNumber_A[0]", PRODUCER.phone);
  setText("Producer_ContactPerson_EmailAddress_A[0]", PRODUCER.email);

  // ── Insured ──
  const insured = resolveNamedInsured(req);
  setText("NamedInsured_FullName_A[0]", insured.name ?? PLACEHOLDER_INSURED);
  setText("NamedInsured_MailingAddress_LineOne_A[0]", insured.address.line1);
  setText("NamedInsured_MailingAddress_LineTwo_A[0]", insured.address.line2);
  setText("NamedInsured_MailingAddress_CityName_A[0]", insured.address.city);
  setText("NamedInsured_MailingAddress_StateOrProvinceCode_A[0]", insured.address.state);
  setText("NamedInsured_MailingAddress_PostalCode_A[0]", insured.address.postalCode);

  // ── Insurers: placeholders only for the letters this cert uses ──
  const letters: Array<[string, boolean]> = [
    ["A", usesA],
    ["B", c.umbrellaExcess.required],
    ["C", c.workersComp.required],
  ];
  for (const [letter, used] of letters) {
    if (!used) continue;
    setText(`Insurer_FullName_${letter}[0]`, `[INSURER ${letter}]`);
    setText(`Insurer_NAICCode_${letter}[0]`, PLACEHOLDER_NAIC);
  }

  // ── General liability ──
  const gl = c.generalLiability;
  if (gl.required) {
    setText("GeneralLiability_InsurerLetterCode_A[0]", "A");
    check("GeneralLiability_CoverageIndicator_A[0]", true);
    if (gl.formType === "claimsMade") check("GeneralLiability_ClaimsMadeIndicator_A[0]", true);
    else check("GeneralLiability_OccurrenceIndicator_A[0]", true);

    const per =
      gl.genAggregateAppliesPer ??
      (req.descriptionOfOperations.structured.perProjectAggregate ? "project" : null);
    check("GeneralLiability_GeneralAggregate_LimitAppliesPerProjectIndicator_A[0]", per === "project");
    check("GeneralLiability_GeneralAggregate_LimitAppliesPerLocationIndicator_A[0]", per === "location");
    check("GeneralLiability_GeneralAggregate_LimitAppliesPerPolicyIndicator_A[0]", per === "policy");

    yes("CertificateOfInsurance_GeneralLiability_AdditionalInsuredCode_A[0]", gl.addlInsured);
    yes("Policy_GeneralLiability_SubrogationWaivedCode_A[0]", gl.subrogationWaived);
    setText("Policy_GeneralLiability_PolicyNumberIdentifier_A[0]", PLACEHOLDER_POLICY);
    setText("Policy_GeneralLiability_EffectiveDate_A[0]", PLACEHOLDER_DATE);
    setText("Policy_GeneralLiability_ExpirationDate_A[0]", PLACEHOLDER_DATE);

    const l = gl.limits;
    setText("GeneralLiability_EachOccurrence_LimitAmount_A[0]", formatMinLimit(l.eachOccurrence));
    setText(
      "GeneralLiability_FireDamageRentedPremises_EachOccurrenceLimitAmount_A[0]",
      formatMinLimit(l.damageToRentedPremises),
    );
    setText("GeneralLiability_MedicalExpense_EachPersonLimitAmount_A[0]", formatMinLimit(l.medicalExpense));
    setText(
      "GeneralLiability_PersonalAndAdvertisingInjury_LimitAmount_A[0]",
      formatMinLimit(l.personalAdvertisingInjury),
    );
    setText("GeneralLiability_GeneralAggregate_LimitAmount_A[0]", formatMinLimit(l.generalAggregate));
    setText(
      "GeneralLiability_ProductsAndCompletedOperations_AggregateLimitAmount_A[0]",
      formatMinLimit(l.productsCompletedOpsAggregate),
    );
  }

  // ── Auto ──
  const auto = c.autoLiability;
  if (auto.required) {
    setText("Vehicle_InsurerLetterCode_A[0]", "A");
    const s = auto.coverageSymbols;
    const anySymbol =
      s.anyAuto || s.ownedAutosOnly || s.scheduledAutos || s.hiredAutosOnly || s.nonOwnedAutosOnly;
    // ANY AUTO covers every other symbol, so it is ticked on its own.
    const any = s.anyAuto || !anySymbol;
    check("Vehicle_AnyAutoIndicator_A[0]", any);
    check("Vehicle_AllOwnedAutosIndicator_A[0]", !any && s.ownedAutosOnly);
    check("Vehicle_ScheduledAutosIndicator_A[0]", !any && s.scheduledAutos);
    check("Vehicle_HiredAutosIndicator_A[0]", !any && s.hiredAutosOnly);
    check("Vehicle_NonOwnedAutosIndicator_A[0]", !any && s.nonOwnedAutosOnly);

    yes("CertificateOfInsurance_AutomobileLiability_AdditionalInsuredCode_A[0]", auto.addlInsured);
    yes("Policy_AutomobileLiability_SubrogationWaivedCode_A[0]", auto.subrogationWaived);
    setText("Policy_AutomobileLiability_PolicyNumberIdentifier_A[0]", PLACEHOLDER_POLICY);
    setText("Policy_AutomobileLiability_EffectiveDate_A[0]", PLACEHOLDER_DATE);
    setText("Policy_AutomobileLiability_ExpirationDate_A[0]", PLACEHOLDER_DATE);

    const l = auto.limits;
    setText("Vehicle_CombinedSingleLimit_EachAccidentAmount_A[0]", formatMinLimit(l.combinedSingleLimit));
    setText("Vehicle_BodilyInjury_PerPersonLimitAmount_A[0]", formatMinLimit(l.bodilyInjuryPerPerson));
    setText("Vehicle_BodilyInjury_PerAccidentLimitAmount_A[0]", formatMinLimit(l.bodilyInjuryPerAccident));
    setText("Vehicle_PropertyDamage_PerAccidentLimitAmount_A[0]", formatMinLimit(l.propertyDamagePerAccident));
  }

  // ── Umbrella / excess ──
  const ux = c.umbrellaExcess;
  if (ux.required) {
    setText("ExcessUmbrella_InsurerLetterCode_A[0]", "B");
    if (ux.type === "excess") check("Policy_PolicyType_ExcessIndicator_A[0]", true);
    else check("Policy_PolicyType_UmbrellaIndicator_A[0]", true);
    if (ux.formType === "claimsMade") check("ExcessUmbrella_ClaimsMadeIndicator_A[0]", true);
    else check("ExcessUmbrella_OccurrenceIndicator_A[0]", true);

    yes("CertificateOfInsurance_ExcessLiability_AdditionalInsuredCode_A[0]", ux.addlInsured);
    yes("Policy_ExcessLiability_SubrogationWaivedCode_A[0]", ux.subrogationWaived);
    setText("Policy_ExcessLiability_PolicyNumberIdentifier_A[0]", PLACEHOLDER_POLICY);
    setText("Policy_ExcessLiability_EffectiveDate_A[0]", PLACEHOLDER_DATE);
    setText("Policy_ExcessLiability_ExpirationDate_A[0]", PLACEHOLDER_DATE);
    setText("ExcessUmbrella_Umbrella_EachOccurrenceAmount_A[0]", formatMinLimit(ux.limits.eachOccurrence));
    setText(
      "ExcessUmbrella_Umbrella_AggregateAmount_A[0]",
      formatMinLimit(ux.limits.aggregate ?? ux.limits.eachOccurrence),
    );
  }

  // ── Workers comp / employers liability ──
  const wc = c.workersComp;
  if (wc.required) {
    setText("WorkersCompensationEmployersLiability_InsurerLetterCode_A[0]", "C");
    check(
      "WorkersCompensationEmployersLiability_WorkersCompensationStatutoryLimitIndicator_A[0]",
      true,
    );
    yes("Policy_WorkersCompensation_SubrogationWaivedCode_A[0]", wc.subrogationWaived);
    setText("Policy_WorkersCompensationAndEmployersLiability_PolicyNumberIdentifier_A[0]", PLACEHOLDER_POLICY);
    setText("Policy_WorkersCompensationAndEmployersLiability_EffectiveDate_A[0]", PLACEHOLDER_DATE);
    setText("Policy_WorkersCompensationAndEmployersLiability_ExpirationDate_A[0]", PLACEHOLDER_DATE);
    const el = wc.employersLiability;
    setText(
      "WorkersCompensationEmployersLiability_EmployersLiability_EachAccidentLimitAmount_A[0]",
      formatMinLimit(el.eachAccident),
    );
    setText(
      "WorkersCompensationEmployersLiability_EmployersLiability_DiseaseEachEmployeeLimitAmount_A[0]",
      formatMinLimit(el.diseaseEachEmployee),
    );
    setText(
      "WorkersCompensationEmployersLiability_EmployersLiability_DiseasePolicyLimitAmount_A[0]",
      formatMinLimit(el.diseasePolicyLimit),
    );
  }

  // ── One "other" coverage on the form row; the rest go in remarks ──
  if (formOther) {
    const first = formOther;
    setText("OtherPolicy_InsurerLetterCode_A[0]", "A");
    setMultiline("OtherPolicy_OtherPolicyDescription_A[0]", first.coverageName, 7);
    yes(
      "CertificateOfInsurance_OtherPolicy_AdditionalInsuredCode_A[0]",
      first.addlInsured && !isPropertyCoverage(first.coverageName),
    );
    yes("OtherPolicy_SubrogationWaivedCode_A[0]", first.subrogationWaived);
    setText("OtherPolicy_PolicyNumberIdentifier_A[0]", PLACEHOLDER_POLICY);
    setText("OtherPolicy_PolicyEffectiveDate_A[0]", PLACEHOLDER_DATE);
    setText("OtherPolicy_PolicyExpirationDate_A[0]", PLACEHOLDER_DATE);
    const suffixes = ["A", "B", "C"];
    first.limits.slice(0, 3).forEach((limit, i) => {
      setMultiline(`OtherPolicy_CoverageCode_${suffixes[i]}[0]`, limit.label, 6);
      const amount = formatMinLimit(limit.amount);
      if (amount) setMultiline(`OtherPolicy_CoverageLimitAmount_${suffixes[i]}[0]`, amount, 6);
    });
  }

  // ── Description of operations ──
  // Long wording (big additional insured lists) goes on an Additional
  // Remarks page, the way an agent would attach an ACORD 101, instead of
  // shrinking below a readable size.
  const remarks = buildCertRemarks(req);
  const remarksName = "CertificateOfLiabilityInsurance_ACORDForm_RemarkText_A[0]";
  const remarksField = byName.get(P + remarksName);
  const boxText = `${SHORT_NOTICE}\n${remarks}`;
  let overflow = false;
  if (remarksField instanceof PDFTextField) {
    if (fitSize(remarksField, boxText, 8) >= MIN_REMARKS_SIZE) {
      setMultiline(remarksName, boxText, 8);
    } else {
      overflow = true;
      const head = remarks.split("\n").filter((l) => /^(Project|Job #|Project Location)/.test(l));
      setMultiline(
        remarksName,
        [SHORT_NOTICE, ...head, "See attached Additional Remarks Schedule (page 2) for the full description of operations."].join("\n"),
        8,
      );
    }
  }

  // ── Certificate holder ──
  const holder = resolveCertificateHolder(req);
  setText("CertificateHolder_FullName_A[0]", holder.name ?? "[CERTIFICATE HOLDER]");
  setText("CertificateHolder_MailingAddress_LineOne_A[0]", holder.address.line1);
  setText("CertificateHolder_MailingAddress_LineTwo_A[0]", holder.address.line2);
  setText("CertificateHolder_MailingAddress_CityName_A[0]", holder.address.city);
  setText("CertificateHolder_MailingAddress_StateOrProvinceCode_A[0]", holder.address.state);
  setText("CertificateHolder_MailingAddress_PostalCode_A[0]", holder.address.postalCode);

  // Bake the values in so every viewer renders the same thing and the
  // example can't be edited into something that looks issued.
  const marks: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const f of form.getFields()) {
    if (!(f instanceof PDFCheckBox)) continue;
    if (checked.has(f.getName())) {
      for (const w of f.acroField.getWidgets()) marks.push(w.getRectangle());
    }
    form.removeField(f);
  }
  form.updateFieldAppearances(helvetica);
  form.flatten();

  const page1 = doc.getPage(0);
  for (const r of marks) {
    const size = Math.min(r.width, r.height) * 0.95;
    const w = bold.widthOfTextAtSize("X", size);
    page1.drawText("X", {
      x: r.x + (r.width - w) / 2,
      y: r.y + (r.height - size * 0.72) / 2,
      size,
      font: bold,
      color: rgb(0, 0, 0),
    });
  }

  if (overflow) drawRemarksPage(doc, helvetica, bold, req, remarks);

  // ── EXAMPLE watermark + footer on every page ──
  const RED = rgb(0.78, 0.1, 0.1);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const mark = "EXAMPLE";
    const markSize = 110;
    const half = bold.widthOfTextAtSize(mark, markSize) / 2;
    page.drawText(mark, {
      x: width / 2 - half * Math.SQRT1_2,
      y: height / 2 - half * Math.SQRT1_2,
      size: markSize,
      font: bold,
      color: RED,
      opacity: 0.1,
      rotate: degrees(45),
    });
    const footer = "EXAMPLE ONLY - NOT AN ISSUED CERTIFICATE - LIMITS SHOWN ARE CONTRACT MINIMUMS";
    const footerSize = 7;
    page.drawText(footer, {
      x: width / 2 - bold.widthOfTextAtSize(footer, footerSize) / 2,
      y: 12,
      size: footerSize,
      font: bold,
      color: RED,
    });
  }

  return await doc.save();
}
