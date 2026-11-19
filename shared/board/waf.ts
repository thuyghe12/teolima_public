/**
 * The Well-Architected Framework design review checklists, one coded
 * recommendation per row, generated from the guidance snapshot by
 * scripts/knowledge/checklists.ts. Do not edit by hand.
 */
export type Pillar = 'reliability' | 'security' | 'cost-optimization' | 'operational-excellence' | 'performance-efficiency';
export interface Recommendation {
  code: string;
  pillar: Pillar;
  /** The recommendation's first sentence. */
  title: string;
  url: string;
}

export const PILLARS: Record<Pillar, string> = {
  reliability: 'Reliability',
  security: 'Security',
  'cost-optimization': 'Cost Optimization',
  'operational-excellence': 'Operational Excellence',
  'performance-efficiency': 'Performance Efficiency',
};

export const CHECKLIST: Recommendation[] = [
  { code: "RE:01", pillar: "reliability", title: "Focus your workload design on simplicity and efficiency.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/simplify" },
  { code: "RE:02", pillar: "reliability", title: "Identify and rate user and system flows.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/identify-flows" },
  { code: "RE:03", pillar: "reliability", title: "Use failure mode analysis (FMA) to identify potential failures in your workload.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/failure-mode-analysis" },
  { code: "RE:04", pillar: "reliability", title: "Define reliability and recovery targets for your workload.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/metrics" },
  { code: "RE:05", pillar: "reliability", title: "Add redundancy at different levels, especially for critical flows, to help meet your reliability targets.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/redundancy" },
  { code: "RE:06", pillar: "reliability", title: "Implement a timely and reliable scaling strategy at the application, data, and infrastructure levels.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/scaling" },
  { code: "RE:07", pillar: "reliability", title: "Strengthen the resiliency of your workload by implementing self-preservation and self-healing measures.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/self-preservation" },
  { code: "RE:08", pillar: "reliability", title: "Test for resiliency and availability scenarios by applying the principles of chaos engineering.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/reliability-test" },
  { code: "RE:09", pillar: "reliability", title: "Implement structured, tested, and documented disaster recovery (DR) plans that align with the recovery targets.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/disaster-recovery" },
  { code: "RE:10", pillar: "reliability", title: "Continuously measure and track system health using uptime and reliability indicators across components and critical flows.", url: "https://learn.microsoft.com/en-us/azure/well-architected/reliability/monitoring" },
  { code: "SE:01", pillar: "security", title: "Establish a security baseline that's aligned to compliance requirements, industry standards, and platform recommendations.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/establish-baseline" },
  { code: "SE:02", pillar: "security", title: "Align secure development lifecycle (SDL) throughout the software development lifecycle to ensure confidentiality, integrity, and availability of software and adopt a security-first mindset.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/secure-development-lifecycle" },
  { code: "SE:03", pillar: "security", title: "Classify and consistently apply sensitivity and information type labels on all workload data and systems involved in data processing.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/data-classification" },
  { code: "SE:04", pillar: "security", title: "Create intentional segmentation and perimeters in your architecture design and in the workload's footprint on the platform.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/segmentation" },
  { code: "SE:05", pillar: "security", title: "Implement strict, conditional, and auditable identity and access management (IAM) across all workload users, team members, and system components.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/identity-access" },
  { code: "SE:06", pillar: "security", title: "Isolate, filter, and control network traffic across both ingress and egress flows.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/networking" },
  { code: "SE:07", pillar: "security", title: "Encrypt data by using modern, industry-standard methods to guard confidentiality and integrity.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/encryption" },
  { code: "SE:08", pillar: "security", title: "Harden all workload components by reducing extraneous surface area and tightening configurations to increase attacker cost.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/harden-resources" },
  { code: "SE:09", pillar: "security", title: "Protect application secrets by hardening their storage and restricting access and manipulation and by auditing those actions.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/application-secrets" },
  { code: "SE:10", pillar: "security", title: "Implement a holistic monitoring strategy that relies on modern threat detection mechanisms that can be integrated with the platform.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/monitor-threats" },
  { code: "SE:11", pillar: "security", title: "Establish a comprehensive testing regimen that combines approaches to prevent security issues, validate threat prevention implementations, and test threat detection mechanisms.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/test" },
  { code: "SE:12", pillar: "security", title: "Define and test effective incident response procedures that cover a spectrum of incidents, from localized issues to disaster recovery.", url: "https://learn.microsoft.com/en-us/azure/well-architected/security/incident-response" },
  { code: "CO:01", pillar: "cost-optimization", title: "Create a culture of financial responsibility.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/create-culture-financial-responsibility" },
  { code: "CO:02", pillar: "cost-optimization", title: "Create and maintain a cost model.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/cost-model" },
  { code: "CO:03", pillar: "cost-optimization", title: "Collect and review cost data.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/collect-review-cost-data" },
  { code: "CO:04", pillar: "cost-optimization", title: "Set spending guardrails.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/set-spending-guardrails" },
  { code: "CO:05", pillar: "cost-optimization", title: "Get the best rates from providers.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/get-best-rates" },
  { code: "CO:06", pillar: "cost-optimization", title: "Align usage to billing increments.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/align-usage-to-billing-increments" },
  { code: "CO:07", pillar: "cost-optimization", title: "Optimize component costs.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-component-costs" },
  { code: "CO:08", pillar: "cost-optimization", title: "Optimize environment costs.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-environment-costs" },
  { code: "CO:09", pillar: "cost-optimization", title: "Optimize flow costs.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-flow-costs" },
  { code: "CO:10", pillar: "cost-optimization", title: "Optimize data costs.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-data-costs" },
  { code: "CO:11", pillar: "cost-optimization", title: "Optimize code costs.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-code-costs" },
  { code: "CO:12", pillar: "cost-optimization", title: "Optimize scaling costs.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-scaling-costs" },
  { code: "CO:13", pillar: "cost-optimization", title: "Optimize personnel time.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/optimize-personnel-time" },
  { code: "CO:14", pillar: "cost-optimization", title: "Consolidate resources and responsibility.", url: "https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/consolidation" },
  { code: "OE:01", pillar: "operational-excellence", title: "Define your standard practices to develop and operate your workload.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/devops-culture" },
  { code: "OE:02", pillar: "operational-excellence", title: "Use standardization as a way to make routine, ad-hoc, and emergency operations consistent and predictable.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/formalize-operations-tasks" },
  { code: "OE:03", pillar: "operational-excellence", title: "Formalize processes across the full software development lifecycle, from ideation to delivery, and make them transparent to the team and stakeholders.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/formalize-development-practices" },
  { code: "OE:04", pillar: "operational-excellence", title: "Enhance software development and quality assurance by implementing industry-standard practices.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/tools-processes" },
  { code: "OE:05", pillar: "operational-excellence", title: "Use a standardized infrastructure as code (IaC) approach to prepare resources and configurations.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/infrastructure-as-code-design" },
  { code: "OE:06", pillar: "operational-excellence", title: "Build a workload supply chain that drives changes through predictable, automated pipelines.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/workload-supply-chain" },
  { code: "OE:07", pillar: "operational-excellence", title: "Design a monitoring stack that captures operational telemetry, metrics, and logs from the workload's infrastructure and code to validate design decisions and guide future improvements.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/observability" },
  { code: "OE:08", pillar: "operational-excellence", title: "Establish a clear, structured incident management process with defined roles, documented procedures, and architecture designed for rapid detection, diagnosis, and recovery.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/incident-response" },
  { code: "OE:09", pillar: "operational-excellence", title: "Enhance the quality of your workload by adopting testing practices that align with business objectives and uphold quality standards.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/testing" },
  { code: "OE:10", pillar: "operational-excellence", title: "Design automation to be reliable, secure, and maintainable across the workload lifecycle.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/enable-automation" },
  { code: "OE:11", pillar: "operational-excellence", title: "Clearly define your workload's safe deployment practices.", url: "https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/safe-deployments" },
  { code: "PE:01", pillar: "performance-efficiency", title: "Define performance targets.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/performance-targets" },
  { code: "PE:02", pillar: "performance-efficiency", title: "Conduct capacity planning.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/capacity-planning" },
  { code: "PE:03", pillar: "performance-efficiency", title: "Select the right services.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/select-services" },
  { code: "PE:04", pillar: "performance-efficiency", title: "Establish consistent performance measurement so behavior can be analyzed over time, compared against baselines, and used to detect degradation, inefficiency, and scaling gaps.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/monitoring" },
  { code: "PE:05", pillar: "performance-efficiency", title: "Optimize scaling and partitioning.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/scale-partition" },
  { code: "PE:06", pillar: "performance-efficiency", title: "Optimize your workload's performance by regularly testing in a production-like environment to ensure your workload reaches the desired performance targets and achieves your business objectives.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/performance-test" },
  { code: "PE:07", pillar: "performance-efficiency", title: "Optimize code and infrastructure.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/optimize-code-infrastructure" },
  { code: "PE:08", pillar: "performance-efficiency", title: "Optimize data usage.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/optimize-data-performance" },
  { code: "PE:09", pillar: "performance-efficiency", title: "Prioritize the performance of critical flows.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/prioritize-critical-flows" },
  { code: "PE:10", pillar: "performance-efficiency", title: "Optimize operational tasks.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/optimize-operational-tasks" },
  { code: "PE:11", pillar: "performance-efficiency", title: "Respond to live performance issues.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/respond-live-performance-issues" },
  { code: "PE:12", pillar: "performance-efficiency", title: "Continuously optimize performance.", url: "https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/continuous-performance-optimize" },
];
