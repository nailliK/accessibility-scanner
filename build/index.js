"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var AccessibilityScanner_1 = __importDefault(require("./classes/AccessibilityScanner"));
// import chalk from "chalk";
var figlet_1 = __importDefault(require("figlet"));
var clear_1 = __importDefault(require("clear"));
var gradient_string_1 = __importDefault(require("gradient-string"));
// import path from "path"
var commander_1 = __importDefault(require("commander"));
var accessibilityScanner = new AccessibilityScanner_1.default();
clear_1.default();
console.log(" ");
console.log(gradient_string_1.default.rainbow.multiline(figlet_1.default.textSync("Accessibility Scanner", {
    horizontalLayout: "fitted",
    font: "Roman"
})));
commander_1.default
    .version("0.0.1")
    .description("A simple website accessibility scanner.")
    .option("-p, --peppers", "Add peppers");
