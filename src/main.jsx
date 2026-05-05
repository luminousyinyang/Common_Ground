import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./App.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";

const rootElement = document.getElementById("root");
const root = window.__COMMON_GROUND_ROOT__ || createRoot(rootElement);
window.__COMMON_GROUND_ROOT__ = root;
root.render(<AppErrorBoundary><App /></AppErrorBoundary>);
