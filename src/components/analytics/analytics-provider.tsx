"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

import { ConsentBanner } from "./consent-banner";
import {
  readConsentCookie,
  writeConsentCookie,
  type ConsentState,
} from "@/lib/analytics/consent";

/**
 * Gates all non-essential tracking behind an explicit decision.
 *
 * GA4 is not loaded at all until consent is granted — not loaded-with-consent-
 * mode-denied. Google's Consent Mode still sends cookieless pings in that
 * state, and while Google considers that compliant, "no request is made" is a
 * position that needs no interpretation to defend.
 *
 * First-party analytics is unaffected by this component: the server logs an
 * actorless page tally regardless, which identifies nobody. Consent is what
 * upgrades that to an attributable session.
 */
export function AnalyticsProvider({ measurementId }: { measurementId?: string }) {
  const [consent, setConsent] = useState<ConsentState>("unset");
  // The banner must not flash on the server-rendered pass, where the cookie is
  // unreadable and every reader would briefly look like a new one.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConsent(readConsentCookie());
    setHydrated(true);
  }, []);

  function decide(state: "granted" | "denied") {
    writeConsentCookie(state);
    setConsent(state);
  }

  const analyticsAllowed = consent === "granted";

  return (
    <>
      {analyticsAllowed && measurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('consent', 'default', {
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied',
                analytics_storage: 'granted'
              });
              gtag('config', '${measurementId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      ) : null}

      {hydrated && consent === "unset" ? (
        <ConsentBanner onDecision={decide} />
      ) : null}
    </>
  );
}
