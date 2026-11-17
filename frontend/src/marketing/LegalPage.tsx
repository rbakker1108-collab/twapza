import { Fragment } from "react";
import { Link } from "react-router-dom";

import { useI18n } from "../i18n";
import { PRIVACY } from "./legal/privacy";
import { TERMS } from "./legal/terms";
import { CONTACT_EMAIL, LEGAL_UPDATED, type LegalDoc } from "./legal/types";

/** Text with the contact email turned into a mailto link. */
export function WithEmailLink({ text }: { text: string }) {
  const parts = text.split(CONTACT_EMAIL);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-400 hover:underline">
              {CONTACT_EMAIL}
            </a>
          )}
        </Fragment>
      ))}
    </>
  );
}

function LegalPage({ docs, other }: { docs: Record<string, LegalDoc>; other: { to: string; label: string } }) {
  const { t, lang } = useI18n();
  const doc = docs[lang] ?? docs.en;
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00Z`).toLocaleDateString(lang, { dateStyle: "long" });
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-faint">{t("Last updated: {date}", { date: updated })}</p>
      <p className="mt-6 text-lg text-ink-soft">
        <WithEmailLink text={doc.intro} />
      </p>
      <div className="mt-10 space-y-9">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-semibold">{s.heading}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-muted">
              {s.paragraphs.map((p) => (
                <p key={p}>
                  <WithEmailLink text={p} />
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-12 border-t border-line pt-6 text-sm">
        <Link to={other.to} className="text-brand-400 hover:underline">
          {other.label}
        </Link>
      </p>
    </article>
  );
}

export function PrivacyPage() {
  const { t } = useI18n();
  return <LegalPage docs={PRIVACY} other={{ to: "/terms", label: t("Terms of service") }} />;
}

export function TermsPage() {
  const { t } = useI18n();
  return <LegalPage docs={TERMS} other={{ to: "/privacy", label: t("Privacy policy") }} />;
}
