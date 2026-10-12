import Link from "next/link";
import type { Metadata } from "next";

import { EmailLink } from "@/components/site/email-link";
import { GrievanceOfficer } from "@/components/site/grievance-officer";
import {
  DOCUMENTS_UPDATED,
  LegalDocument,
  Lead,
  clauseLink as link,
} from "@/components/site/legal-document";
import { pageMetadata } from "@/lib/seo/metadata";
import { HAS_CONTACT_PAGE, PUBLISHER, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description: `Who publishes ${SITE_NAME}, the law it publishes under, how it reports crime, courts and conflict, and how to raise a complaint.`,
  path: "/about",
});

/**
 * The About page, set out as a publisher's statement: the law each clause
 * rests on is named in it, so a reader — or a lawyer acting for one — can
 * see what the paper holds itself to and cite the clause.
 *
 * Every statute is cited by its current name: the Bharatiya Nyaya Sanhita,
 * 2023 replaced the Indian Penal Code from 1 July 2024, so defamation is
 * section 356 and the protection of a victim's identity section 72.
 *
 * Nothing in it may say more than the paper actually does. Details the owner
 * has not supplied yet (the legal entity, its address, the editor and the
 * grievance officer's names) come from PUBLISHER and are left out until they
 * are set, never filled with a stand-in.
 */
export default function AboutPage() {
  const officer = PUBLISHER.grievanceOfficer;
  const editor = PUBLISHER.editor;

  return (
    <LegalDocument
      title={`About ${SITE_NAME}`}
      standfirst="Who we are, the law we publish under, and what anyone we write about, or who reads us, is entitled to expect."
      lastUpdated={DOCUMENTS_UPDATED}
      sections={[
        {
          id: "publication",
          join: true,
          title: "The publication",
          items: [
            <>
              {SITE_NAME} is an English-language digital news publication
              covering India and the world: politics and government, courts and
              justice, business and markets, conflict and international
              affairs, technology, science, health, the environment, sport and
              culture. Every section is listed on the{" "}
              <Link href="/sections" className={link}>
                sections page
              </Link>
              .
            </>,
            PUBLISHER.legalName ? (
              <>
                {SITE_NAME} is published by {PUBLISHER.legalName}
                {PUBLISHER.address
                  ? `, whose registered office is at ${PUBLISHER.address}`
                  : ""}
                {PUBLISHER.foundingYear
                  ? `, and was founded in ${PUBLISHER.foundingYear}`
                  : ""}
                .
                {editor.name
                  ? ` ${editor.name}${editor.title ? `, ${editor.title},` : ""} is responsible for the selection of what we publish.`
                  : ""}
              </>
            ) : null,
            <>
              We are a publisher of news and current affairs content within the
              meaning of the Information Technology (Intermediary Guidelines and
              Digital Media Ethics Code) Rules, 2021, and we publish from India.
              The people responsible for the paper are listed on the{" "}
              <Link href="/masthead" className={link}>
                masthead
              </Link>
              .
            </>,
          ],
        },
        {
          id: "law",
          title: "The law we publish under",
          items: [
            <>
              We publish under the Constitution of India, and in particular the
              freedom of speech and expression in Article 19(1)(a), subject to
              the reasonable restrictions that Article 19(2) permits.
            </>,
            <>
              We follow the Code of Ethics in the Appendix to the 2021 Rules,
              which applies to us the Norms of Journalistic Conduct of the Press
              Council of India under the Press Council Act, 1978, and the
              Programme Code under section 5 of the Cable Television Networks
              (Regulation) Act, 1995.
            </>,
            <>
              We are bound by the Information Technology Act, 2000, the
              Bharatiya Nyaya Sanhita, 2023, the Contempt of Courts Act, 1971,
              the Copyright Act, 1957, and the Digital Personal Data Protection
              Act, 2023, among others. The clauses below set out how each bears
              on what we publish. The use of this site is governed by our{" "}
              <Link href="/terms" className={link}>
                terms of use
              </Link>
              .
            </>,
          ],
        },
        {
          id: "accuracy",
          join: true,
          title: "Accuracy and sources",
          items: [
            <>
              Our stories are built from the documents, statements, filings and
              published reports behind the news, and they name the people and
              organisations their facts come from.
            </>,
            <>
              A story&rsquo;s central claims are checked against independent
              sources before it is published: at least three for deaths, crimes
              and allegations against named people, and at least two for other
              significant claims. A story whose sources have gone stale is not
              published as news.
            </>,
            <>
              Where figures conflict, we report the most recent attributed
              figure and say whose it is. Opinion is labelled as such and kept
              apart from news. The full rules are in our{" "}
              <Link href="/editorial-standards" className={link}>
                editorial standards
              </Link>
              .
            </>,
          ],
        },
        {
          id: "crime-and-courts",
          title: "Reporting crime, courts and investigations",
          items: [
            <>
              <Lead>Presumption of innocence.</Lead>A person who is arrested,
              named in a first information report, charge-sheeted or on trial
              has not been convicted. We describe them as accused or suspected,
              attribute every allegation to the police, prosecution,
              complainant or court that made it, and do not state or imply guilt
              before a court has found it.
            </>,
            <>
              <Lead>Defamation.</Lead>Defamation is both a civil wrong and an
              offence under section 356 of the Bharatiya Nyaya Sanhita, 2023.
              We publish imputations against a named person only where they are
              true and their publication is for the public good, where they
              concern the public conduct of a public servant or a matter of
              public question, or where they are a substantially accurate report
              of proceedings in a court, as the exceptions to that section
              allow.
            </>,
            <>
              <Lead>Identity of victims and children.</Lead>We do not publish
              the name, or anything that could identify, a victim of an offence
              covered by section 72 of the Bharatiya Nyaya Sanhita, 2023
              (including rape and other sexual offences); a child who is the
              victim of an offence under the Protection of Children from Sexual
              Offences Act, 2012 (section 23); or a child in conflict with the
              law or in need of care and protection under the Juvenile Justice
              (Care and Protection of Children) Act, 2015 (section 74). This
              covers names, addresses, schools, relatives and photographs.
            </>,
            <>
              <Lead>Courts and contempt.</Lead>We report judicial proceedings
              fairly and accurately, which section 4 of the Contempt of Courts
              Act, 1971 protects, and comment on decided cases as section 5
              permits. We do not publish material that prejudges a pending case,
              attributes motives to a judge, or reports proceedings a court has
              ordered held in camera or not to be published.
            </>,
            <>
              <Lead>Investigations.</Lead>We do not publish material that would
              identify a protected witness or an undercover officer, or that a
              court has ordered withheld.
            </>,
          ],
        },
        {
          id: "conflict",
          title: "Reporting conflict and international affairs",
          items: [
            <>
              In armed conflict, every party is a source with an interest. We
              attribute casualty figures, territorial claims and accounts of
              attacks to the government, armed force, agency or organisation
              that gave them, and we say when a claim could not be independently
              verified.
            </>,
            <>
              We use the terms of international law precisely. We say that an
              act breaches international humanitarian law, or amounts to a war
              crime, genocide or a crime against humanity, only where a court,
              tribunal or United Nations body has found so, or as the attributed
              view of whoever asserts it.
            </>,
            <>
              Consistent with Article 13 of the Third Geneva Convention, which
              protects prisoners of war against insults and public curiosity, we
              do not publish images that humiliate an identifiable prisoner or
              detainee. We do not publish material that glorifies or incites
              violence, or propaganda issued by a proscribed organisation except
              as reported, attributed and in context.
            </>,
            <>
              Reports of sanctions, international court proceedings and the
              positions of foreign governments are attributed to their source
              documents. Where India&rsquo;s official position differs, we
              report both and say which is which.
            </>,
          ],
        },
        {
          id: "elections",
          title: "Elections",
          items: [
            <>
              We do not publish the result of any exit poll during the period
              the Election Commission of India notifies under section 126A of
              the Representation of the People Act, 1951, and we observe the
              restrictions of section 126 in the hours before polling closes.
            </>,
          ],
        },
        {
          id: "corrections",
          title: "Corrections, replies and removal",
          items: [
            <>
              When we get something wrong we correct it in the story, and every
              change to a published story is kept in a permanent version
              history. Our{" "}
              <Link href="/corrections" className={link}>
                corrections policy
              </Link>{" "}
              explains how to tell us about an error.
            </>,
            <>
              A person or organisation that a story makes an allegation against
              may send a reply
              {editor.email ? (
                <>
                  {" "}to <EmailLink address={editor.email} />
                </>
              ) : null}
              . We consider every reply for publication and, where we publish
              it, add it to the story concerned.
            </>,
            <>
              We comply with a lawful order of a court or competent authority to
              remove or modify published material. We do not otherwise remove
              stories because they are unwelcome to someone named in them; we
              correct them where they are wrong.
            </>,
          ],
        },
        {
          id: "copyright",
          title: "Copyright and pictures",
          items: [
            <>
              The text of our stories is our copyright under the Copyright Act,
              1957. You may quote it with attribution and a link; you may not
              republish whole stories without our written permission
              {PUBLISHER.partnershipsEmail ? (
                <>
                  , which you can ask for at{" "}
                  <EmailLink address={PUBLISHER.partnershipsEmail} />
                </>
              ) : null}
              . The full conditions are in our{" "}
              <Link href="/terms#our-content" className={link}>
                terms of use
              </Link>
              .
            </>,
            <>
              We publish photographs only where their licence allows it, and we
              credit the photographer and licence with each one. Where no
              suitable photograph exists we use a plain typographic card rather
              than an image that could be mistaken for a picture of the event.
              Quotation from other works is limited to what fair dealing for
              reporting current events allows under section 52(1)(a) of the
              Act.
            </>,
            <>
              If you hold the rights in material we have published and believe
              we have used it without permission, write to us as set out under
              Complaints and grievance redressal below, with the story&rsquo;s
              address and evidence of your rights, and we will act on it.
            </>,
          ],
        },
        {
          id: "privacy",
          join: true,
          title: "Personal data",
          items: [
            <>
              We process readers&rsquo; personal data in accordance with the
              Digital Personal Data Protection Act, 2023. What we collect, what
              we do not, and the choices you have are set out on our{" "}
              <Link href="/privacy" className={link}>
                privacy page
              </Link>
              .
            </>,
            officer.email ? (
              <>
                Requests to see, correct or erase personal data we hold about
                you go to <GrievanceOfficer />.
              </>
            ) : null,
          ],
        },
        {
          id: "grievances",
          join: true,
          title: "Complaints and grievance redressal",
          items: [
            officer.name || officer.email ? (
              <>
                Complaints about our content, including complaints that it
                breaches the Code of Ethics, go to <GrievanceOfficer />
                {officer.phone ? ` or ${officer.phone}` : ""}. Please give the
                address of the story and say what you believe is wrong with it.
              </>
            ) : null,
            officer.name || officer.email ? (
              <>
                We acknowledge every complaint within 24 hours of receiving it
                and send a decision within 15 days, as the 2021 Rules require.
                If you are not satisfied with our decision, the Rules provide
                further levels of redress beyond the publisher.
              </>
            ) : null,
            HAS_CONTACT_PAGE ? (
              <>
                Every other way to reach us is on the{" "}
                <Link href="/contact" className={link}>
                  contact page
                </Link>
                .
              </>
            ) : null,
          ],
        },
        {
          id: "disclaimer",
          join: true,
          title: "Use of this site",
          items: [
            <>
              What we publish is news and comment for general information. It
              is not legal, financial, medical or other professional advice,
              and should not be relied on as such.
            </>,
            <>
              Links to other websites are given so that readers can see our
              sources. We are not responsible for the content of those sites,
              and a link is not an endorsement. The rest of the conditions on
              which the site is offered are in our{" "}
              <Link href="/terms" className={link}>
                terms of use
              </Link>
              .
            </>,
          ],
        },
        {
          id: "jurisdiction",
          join: true,
          title: "Governing law and jurisdiction",
          items: [
            <>
              This statement, and any dispute arising from what we publish, is
              governed by the laws of India.
            </>,
            <>
              {PUBLISHER.address
                ? `Subject to the grievance process above, the courts having jurisdiction over our registered office at ${PUBLISHER.address} have jurisdiction over any such dispute.`
                : "Subject to the grievance process above, the competent courts in India have jurisdiction over any such dispute."}
            </>,
          ],
        },
      ]}
    />
  );
}
