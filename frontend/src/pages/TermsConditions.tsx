import { PageHeader } from "@/components/bits";

const SECTIONS = [
  {
    title: "1. The service",
    body: "180Days is a personal learning tracker built around a 180-day DSA + MERN curriculum. It is provided for individual, non-commercial use. The roadmap content is reference material — completion of the program does not guarantee any exam result, job or outcome.",
  },
  {
    title: "2. Your account",
    body: "You are responsible for the accuracy of your email address and for keeping your password safe. You may pause your journey at any time; your completed progress is preserved. One person, one account — sharing accounts breaks the progress model and is not permitted.",
  },
  {
    title: "3. Acceptable use",
    body: "Do not attempt to access another user's data, scrape the service, abuse the API (automated request floods, auth probing) or use the platform for unlawful content. Rate limits and audit logs are in place; abuse may lead to account termination.",
  },
  {
    title: "4. Your content",
    body: "Your notes, reflections and project links remain yours. By using the service you grant us the limited right to store and display that content back to you — nothing more. Export your data at any time from Settings.",
  },
  {
    title: "5. Availability & liability",
    body: "The service is offered \u201Cas is\u201D. We aim for high availability but do not guarantee uninterrupted operation. To the maximum extent permitted by law, 180Days is not liable for indirect or consequential losses arising from use of the service.",
  },
  {
    title: "6. Changes",
    body: "We may update these terms; material changes will be reflected by the date below. Continuing to use the service after changes means you accept the updated terms.",
  },
];

export default function TermsConditions() {
  return (
    <div className="mx-auto max-w-3xl" data-testid="terms-page">
      <PageHeader title="Terms & Conditions" sub="The short, readable agreement between you and 180Days." testId="terms-header" />
      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title} data-testid="terms-section">
            <h2 className="font-heading text-lg font-bold">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" })}</p>
    </div>
  );
}
