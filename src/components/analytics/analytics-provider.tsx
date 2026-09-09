"use client";

import Script from "next/script";
import { useSyncExternalStore } from "react";

import { ConsentBanner } from "./consent-banner";
import {
  CONSENT_SERVER_SNAPSHOT,
  getConsentServerSnapshot,
  notifyConsentChanged,
  readConsentCookie,
  subscribeToConsent,
  writeConsentCookie,
} from "@/lib/analytics/consent";

/**
 * Gates all non-essential tracking behind an explicit decision.
 *
 * GA4 is not loaded at all until consent is granted — not loaded-with-consent-
 * mode-denied. Google's Consent Mode still sends cookieless pings in that
 * state, and while Google considers that compliant, "no request is made" is a
 * position that needs no interpretation to defend.
 *
 * The cookie is read through useSyncExternalStore rather than copied into
 * component state, so there is exactly one source of truth. On the server the
 * snapshot is a distinct sentinel, which is what keeps the banner out of the
 * server-rendered HTML and prevents it flashing at readers who already decided.
 *
 * First-party analytics is unaffected by this component: the server logs an
 * actorless page tally regardless, which identifies nobody. Consent is what
 * upgrades that to an attributable session.
 */
export function AnalyticsProvider({ measurementId }: { measurementId?: string }) {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    readConsentCookie,
    getConsentServerSnapshot,
  );

  function decide(state: "granted" | "denied") {
    writeConsentCookie(state);
    notifyConsentChanged();
  }

  const analyticsAllowed = consent === "granted";
  const shouldAsk = consent === "unset";
  const isServerRender = consent === CONSENT_SERVER_SNAPSHOT;

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

      {shouldAsk && !isServerRender ? <ConsentBanner onDecision={decide} /> : null}
    </>
  );
}
