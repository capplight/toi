import { LegalPage, legalMetadata } from "../LegalPage";

export const generateMetadata = () => legalMetadata("terms");

export default function Page() {
  return <LegalPage page="terms" />;
}
