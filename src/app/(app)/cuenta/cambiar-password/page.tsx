import { PageHeader } from "@/components/ui/page-header";
import { ChangePasswordForm } from "@/components/leadership/change-password-form";

export const metadata = { title: "Cambiar contraseña" };

export default function ChangePasswordPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Primer ingreso"
        description="Establece tu contraseña definitiva. Las credenciales temporales no se guardan en auditoría."
      />
      <ChangePasswordForm />
    </div>
  );
}
