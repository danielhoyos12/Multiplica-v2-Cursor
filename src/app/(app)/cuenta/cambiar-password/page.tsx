import { PageHeader } from "@/components/ui/page-header";
import { ChangePasswordForm } from "@/components/leadership/change-password-form";

export const metadata = { title: "Cambiar contraseña" };

export default function ChangePasswordPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Cambiar contraseña"
        description="Establece tu contraseña definitiva antes de continuar. Hasta completarlo no puedes navegar la aplicación."
      />
      <ChangePasswordForm />
    </div>
  );
}
