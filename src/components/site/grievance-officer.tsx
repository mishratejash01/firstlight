import { EmailLink } from "@/components/site/email-link";
import { PUBLISHER } from "@/lib/site";

/**
 * The grievance officer, named in running text: "our grievance officer,
 * Jane Doe, at grievance@…", with whichever of the name and the address are
 * set, and the commas right for that.
 *
 * One component because several pages name the officer mid-sentence, and the
 * IT Rules ask for both the name and the contact details to be published. A
 * page that drifted into giving one without the other would be the page that
 * got it wrong.
 */
export function GrievanceOfficer() {
  const { name, email } = PUBLISHER.grievanceOfficer;

  return (
    <>
      our grievance officer
      {name ? `, ${name}${email ? "," : ""}` : null}
      {email ? (
        <>
          {" "}at <EmailLink address={email} />
        </>
      ) : null}
    </>
  );
}
