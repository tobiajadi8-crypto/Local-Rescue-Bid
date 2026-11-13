interface Props {
  label: string;
}

export function StepPlaceholder({ label }: Props) {
  return (
    <div className="step-placeholder">
      <p>{label} — coming soon</p>
    </div>
  );
}
