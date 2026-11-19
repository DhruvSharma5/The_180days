import { PageHeader } from "@/components/bits";

const SECTIONS = [
  {
    title: "1. What we collect",
    body: [
      "Account data: your name, email address, hashed password (bcrypt — we can never read it), timezone and notification preferences.",
      "Learning data: your journey start date, daily task completions, notes you write, mock scores, checkpoint reviews and project tracker entries.",
      "Usage analytics: anonymous page-view and visit events (an anonymous session id, the page path, coarse device/browser class and timestamp). We do not use cookies for tracking, we do not store IP addresses, and we do not fingerprint.",
    ],
  },
  {
    title: "2. What we never collect or do",
    body: [
      "We never store passwords in plain text or authentication tokens in your browser's localStorage — sessions live in httpOnly cookies.",
      "We never sell your data, and we never show your personal notes or progress to other users.",
      "We do not send email unless you opt in to reminders; transactional email (verification, password reset) is always related to an action you took.",
    ],
  },
  {
    title: "3. How your data is stored",
    body: [
      "All records live in MongoDB, keyed to your unique user id. Roadmap content is shared master data; your progress is private to your account.",
      "Access is enforced server-side: every request re-derives your identity from the session cookie, and every query is scoped to your user id.",
    ],
  },
  {
    title: "4. Your rights",
    body: [
      "Export: Settings → Export my data gives you a complete JSON copy of everything tied to your account, at any time.",
      "Deletion & questions: write to the contact address in the app footer and we will delete your account and all associated records.",
      "Admin access: only the application owner (a single, server-seeded admin account) can see aggregate analytics — never your notes, passwords or personal progress.",
    ],
  },
  {
    title: "5. Security",
    body: [
      "Passwords: bcrypt-hashed. Sessions: signed JWTs in Secure, SameSite, httpOnly cookies with expiry and re-issue on rotation.",
      "Endpoints are rate-limited; verification codes and password-reset links are single-use and expire; changing your password invalidates other sessions.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl" data-testid="privacy-policy-page">
      <PageHeader title="Privacy Policy" sub="Plain-language summary of what 180Days stores, why, and the controls you have." testId="privacy-header" />
      <div className="space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title} data-testid="privacy-section">
            <h2 className="font-heading text-lg font-bold">{s.title}</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              {s.body.map((p) => <li key={p.slice(0, 24)}>{p}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-muted-foreground">Last updated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "long" })}</p>
    </div>
  );
}
