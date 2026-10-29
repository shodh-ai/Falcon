import { MyDocumentsPanel } from "@/components/self-service/MyDocumentsPanel";
export default function PrincipalProfile() {
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-sgvu-navy">
          My Profile & Documents
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your personal records remain attached to your own account.
        </p>
      </header>
      <MyDocumentsPanel allowDemoFallback={false} />
    </section>
  );
}
