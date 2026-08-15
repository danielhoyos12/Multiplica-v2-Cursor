# UAT checklist (no técnico)

Usar cuentas de **staging** (nunca producción). Datos de prueba, no personas reales.

## Cuentas

- [ ] Superadmin
- [ ] Líder General
- [ ] Líder A
- [ ] Líder B (hermano)
- [ ] Staff/profesor

Passwords solo en gestor de secretos del equipo.

## Flujos

### Login
- [ ] Login válido → dashboard
- [ ] Login inválido → mensaje neutro
- [ ] Logout
- [ ] Si pide cambio de contraseña, no deja usar el resto hasta cambiarla

### Registrar persona (Ganar)
- [ ] Crear persona interna
- [ ] Abrir detalle
- [ ] Ver organización
- [ ] Petición de oración solo en detalle autorizado

### Formulario público
- [ ] `/ganar/registro` sin login
- [ ] Éxito genérico
- [ ] No revela si el teléfono ya existía

### Célula
- [ ] Abrir célula
- [ ] Agregar miembro por búsqueda (no UUID)
- [ ] Tomar asistencia
- [ ] Retirar/transferir y ver historial

### Liderazgo
- [ ] Activar líder elegible
- [ ] Ver árbol / X/12
- [ ] Credenciales temporales solo una vez

### Proceso
- [ ] Pre → Encuentro → Post (o fixture)
- [ ] CD1 representativo

### Enviar
- [ ] Completar Enviar con EM3
- [ ] Marcar elegible no activa liderazgo solo

### Transferencias
- [ ] Solicitar → aprobar → ejecutar
- [ ] Confirmar historial y nuevo alcance

### Dashboard / reportes
- [ ] Líder ve su scope
- [ ] LG ve ministerio
- [ ] Superadmin global
- [ ] Export CSV sin petición de oración

### Mobile / iPad
- [ ] Login, Ganar, asistencia, dashboard usables al tacto

## Resultado

Fecha: ____  Tester: ____  PASS / FAIL: ____  Notas: ____
