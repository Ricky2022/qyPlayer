import { createRoot } from "react-dom/client";
import { I18nProvider } from "../i18n";
import { CreatorApp } from "./CreatorApp";

createRoot(document.getElementById("root")!).render(
  <I18nProvider title={(t) => t("makerName")}>
    <CreatorApp />
  </I18nProvider>,
);
