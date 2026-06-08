import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MarkdownChat from "../components/Chat";
import "../styles/global.scss";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
    <StrictMode >
        <MarkdownChat />
    </StrictMode>
);
