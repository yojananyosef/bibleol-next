import { getAvailableLanguages, getAvailableVariants } from "@/lib/languages";
import { SignUpForm } from "./sign-up-form";

export default function SignUpPage() {
  return (
    <SignUpForm languages={getAvailableLanguages()} variants={getAvailableVariants()} />
  );
}
