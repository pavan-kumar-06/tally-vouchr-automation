export function HowItWorks() {
  return (
    <div className="vouchr-gradient rounded-2xl p-6 text-white shadow-panel">
      <h3 className="font-heading text-3xl font-semibold">How it Works?</h3>
      <div className="mt-6 grid grid-cols-3 gap-6">
        <Step title="Download Tally Connector" subtitle="Install the local bridge on your desktop" number={1} />
        <Step title="Run Tally Connector" subtitle="Keep it open in system tray" number={2} />
        <Step title="Run Tally Software" subtitle="Open the target company in Tally" number={3} />
      </div>
    </div>
  );
}

function Step({ title, subtitle, number }: { title: string; subtitle: string; number: number }) {
  return (
    <div className="space-y-1">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-mint-500 text-xs font-bold text-slate-900">{number}</span>
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-sm text-white/75">{subtitle}</p>
    </div>
  );
}
