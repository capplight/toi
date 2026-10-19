import { LegalPage, legalMetadata } from "../LegalPage";

export const generateMetadata = () => legalMetadata("privacy");

export default function Page() {
  return <LegalPage page="privacy" />;
}
