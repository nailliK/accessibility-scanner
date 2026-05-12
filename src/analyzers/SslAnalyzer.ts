import tls from "tls";
import {Analyzer, AnalyzerDomainResult, AnalyzerOutput, AnalyzerSummary} from "#/interfaces/Analyzer";
import {Scan} from "#/interfaces/Scan";
import {SslFindings} from "#/interfaces/Findings";

class SslAnalyzer implements Analyzer {
    readonly name = "SSL/TLS";
    readonly type = "ssl";

    public async analyzeDomain(domain: string): Promise<AnalyzerDomainResult> {
        const findings = await this.checkCertificate(domain);
        return {
            domain,
            findings: findings as unknown as Record<string, unknown>
        };
    }

    private checkCertificate(hostname: string): Promise<SslFindings> {
        return new Promise((resolve) => {
            const socket = tls.connect(443, hostname, {servername: hostname}, () => {
                const cert = socket.getPeerCertificate();
                const authorized = socket.authorized;
                const protocol = socket.getProtocol();

                const validFrom = cert.valid_from || null;
                const validTo = cert.valid_to || null;
                let daysUntilExpiry: number | null = null;
                if (validTo) {
                    const expiryDate = new Date(validTo);
                    daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                }

                socket.end();
                resolve({
                    valid: authorized,
                    issuer: cert.issuer ? Object.values(cert.issuer).join(", ") : null,
                    subject: cert.subject ? (Array.isArray(cert.subject.CN) ? cert.subject.CN.join(", ") : cert.subject.CN || Object.values(cert.subject).flat().join(", ")) : null,
                    validFrom,
                    validTo,
                    daysUntilExpiry,
                    protocol: protocol || null,
                    error: null
                });
            });

            socket.on("error", (err) => {
                resolve({
                    valid: false,
                    issuer: null,
                    subject: null,
                    validFrom: null,
                    validTo: null,
                    daysUntilExpiry: null,
                    protocol: null,
                    error: err.message
                });
            });

            socket.setTimeout(10000, () => {
                socket.destroy();
                resolve({
                    valid: false,
                    issuer: null,
                    subject: null,
                    validFrom: null,
                    validTo: null,
                    daysUntilExpiry: null,
                    protocol: null,
                    error: "Connection timed out"
                });
            });
        });
    }

    public summarize(output: AnalyzerOutput, _scan: Scan): AnalyzerSummary {
        const keyFindings: string[] = [];
        const overview: string[] = [];

        if (!output.domainResult) {
            overview.push("SSL check not performed.");
            return {keyFindings, overview};
        }
        const f = output.domainResult.findings as any;

        if (f.error) {
            keyFindings.push(`SSL error: ${f.error}`);
            overview.push(`SSL error: ${f.error}`);
            return {keyFindings, overview};
        }

        if (!f.valid) {
            keyFindings.push("SSL certificate is invalid.");
            overview.push("SSL certificate is invalid — visitors will see browser security warnings, which erodes trust and causes most users to leave immediately.");
            return {keyFindings, overview};
        }

        if (f.daysUntilExpiry !== null && f.daysUntilExpiry < 30) {
            keyFindings.push(`SSL certificate expires in ${f.daysUntilExpiry} days — renewal urgent.`);
            overview.push(`SSL certificate expires in ${f.daysUntilExpiry} days — renewal is urgent to avoid browser security warnings.`);
        } else if (f.daysUntilExpiry !== null && f.daysUntilExpiry < 90) {
            keyFindings.push(`SSL valid, expires in ${f.daysUntilExpiry} days.`);
            overview.push(`SSL certificate expires in ${f.daysUntilExpiry} days — consider scheduling renewal.`);
        } else {
            keyFindings.push(`SSL valid, expires in ${f.daysUntilExpiry} days.`);
            overview.push(`SSL certificate valid, expires in ${f.daysUntilExpiry} days.`);
        }

        overview.push(`Protocol: ${f.protocol}. Issued by: ${f.issuer || "Unknown"}.`);

        return {keyFindings, overview};
    }
}

export default SslAnalyzer;
