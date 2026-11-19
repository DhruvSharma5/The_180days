// First-party, privacy-conscious analytics client: no PII, no IP, no fingerprinting —
// an anonymous session id and coarse page events. Auth tokens never touch localStorage;
// the analytics session id is not an auth credential.
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { apiPost } from "@/lib/api";

const SID_KEY = "180days_sid";
const LAST_VISIT_KEY = "180days_last_visit";

function sessionId(): string {
  let sid = localStorage.getItem(SID_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SID_KEY, sid);
  }
  return sid;
}

export function track(type: "visit" | "page_view", path: string): void {
  const lastVisit = Number(localStorage.getItem(LAST_VISIT_KEY) ?? 0);
  try {
    void apiPost("/analytics/event", {
      type,
      session_id: sessionId(),
      path,
      referrer: document.referrer || "",
      screen_w: window.innerWidth,
      screen_h: window.innerHeight,
    });
    if (type === "visit") localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
  } catch {
    // analytics must never break the app
  }
  void lastVisit;
}

/** Mounted once inside the Router: logs a daily visit + every page view. */
export function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(LAST_VISIT_KEY + "_d") !== today) {
      localStorage.setItem(LAST_VISIT_KEY + "_d", today);
      track("visit", location.pathname);
    }
    track("page_view", location.pathname);
  }, [location.pathname]);
  return null;
}
