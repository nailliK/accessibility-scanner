import chalk from "chalk";

class MessageLogger {
    public logSuccess(message: string): void {
        console.log(chalk`{green ✓ ${message}}`);
    }

    public logWarning(message: string): void {
        console.log(chalk`{yellow ⚠ ${message}}`);
    }

    public logFailure(message: string): void {
        console.log(chalk`{red ✗ ${message}}`);
    }
}

export default MessageLogger;
