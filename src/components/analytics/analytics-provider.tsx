"use client";

import Script from "next/script";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ConsentBanner } from "./consent-banner";
import {
  CONSENT_SERVER_SNAPSHOT,
  getConsentServerSnapshot,
  measurementAllowed,
  readTrackingMode,
  recordChoice,
  subscribeToChoiceRequests,
  subscribeToConsent,
} from "@/lib/analytics/consent";

/**
 * Gates all non-essential tracking on the reader's choice.
 *
 * GA4 is not loaded at all unless measurement is allowed: the reader agreed,
 * or reads from India while measurement there is on by default (see
 * lib/analytics/consent for why, and until when). It is never loaded with
 * Consent Mode set to denied, because Consent Mode still sends cookieless pings
 * in that state; "no request is made" needs no interpretation to defend.
 *
 * The cookie is read through useSyncExternalStore rather than copied into
 * component state, so there is exactly one source of truth. On the server the
 * snapshot is a distinct sentinel, which is what keeps the banner out of the
 * server-rendered HTML and prevents it flashing at readers who already decided.
 *
 * First-party analytics is unaffected by this component: the server logs an
 * actorless page tally regardless, which identifies nobody. Measurement being
 * allowed is what upgrades that to an attributable session.
 */
export function AnalyticsProvider({ measurementId }: { measurementId?: string }) {
  const mode = useSyncExternalStore(
    subscribeToConsent,
    readTrackingMode,
    getConsentServerSnapshot,
  );
  // Set when the reader opens Privacy settings: the full question, whatever
  // the current state, until they answer it.
  const [choosing, setChoosing] = useState(false);
  useEffect(() => subscribeToChoiceRequests(() => setChoosing(true)), []);

  function decide(state: "granted" | "denied" | "noted") {
    setChoosing(false);
    recordChoice(state);
  }

  if (mode === CONSENT_SERVER_SNAPSHOT) return null;

  const banner = choosing ? "ask" : mode === "ask" || mode === "notice" ? mode : null;

  return (
    <>
      {measurementAllowed(mode) && measurementId ? (
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

      {banner ? <ConsentBanner variant={banner} onDecision={decide} /> : null}
    </>
  );
}
