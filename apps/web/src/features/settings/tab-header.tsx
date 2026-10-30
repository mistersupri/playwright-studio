export function TabHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
