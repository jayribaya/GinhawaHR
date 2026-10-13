import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post, text, type Row } from "../services/api";
import { ResourceForm } from "../components/ResourceForm";
import { Button } from "../components/ui/button";
import { State } from "./Resources";
export function Account() {
  const cache = useQueryClient(),
    [message, setMessage] = useState("");
  const [mfa, setMfa] = useState<{ secret: string; uri: string } | null>(null);
  const setup = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post<{ secret: string; uri: string }>("/auth/mfa/setup", data),
    onSuccess: (result) => setMfa(result.data),
  });
  const enable = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post("/auth/mfa/enable", data),
    onSuccess: () => {
      setMfa(null);
      setMessage(
        "Authenticator protection enabled. Your next login requires the code.",
      );
    },
  });
  const query = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<Row[]>("/auth/sessions"),
  });
  const change = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post("/auth/change-password", data),
    onSuccess: () =>
      setMessage("Password changed. All sessions revoked. Sign in again."),
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api("/auth/sessions/" + id, { method: "DELETE" }),
    onSuccess: () => void cache.invalidateQueries(),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your account</h1>
          <p>Manage your password and active sessions.</p>
        </div>
      </div>
      <section className="card padded">
        <h2>Change password</h2>
        {message && <p role="status">{message}</p>}
        <ResourceForm
          fields={[
            {
              name: "current",
              label: "Current password",
              type: "password",
              required: true,
            },
            {
              name: "password",
              label: "New password (at least 12 characters)",
              type: "password",
              required: true,
            },
          ]}
          onSubmit={(d) => change.mutate(d)}
          busy={change.isPending}
          error={change.error?.message}
        />
      </section>
      <section className="card padded">
        <h2>Active sessions</h2>
        <State loading={query.isPending} error={query.error} />
        {revoke.error && <p className="error">{revoke.error.message}</p>}
        {query.data?.data.map((s) => (
          <div className="timeline-row" key={s._id}>
            <span>Created {text(s.createdAt)}</span>
            <span>Last active {text(s.lastUsedAt)}</span>
            <Button variant="outline" onClick={() => revoke.mutate(s._id)}>
              Revoke
            </Button>
          </div>
        ))}
      </section>
      <section className="card padded">
        <h2>Authenticator protection</h2>
        <p className="subtle">
          Add this account to your authenticator app, then confirm a code. Keep
          your enrollment secret private.
        </p>
        {!mfa ? (
          <ResourceForm
            fields={[
              {
                name: "current",
                label: "Confirm current password",
                type: "password",
                required: true,
              },
            ]}
            onSubmit={(d) => setup.mutate(d)}
            busy={setup.isPending}
            error={setup.error?.message}
          />
        ) : (
          <>
            <p className="token-display">
              Enrollment secret: <code>{mfa.secret}</code>
            </p>
            <ResourceForm
              fields={[
                {
                  name: "code",
                  label: "Six-digit authenticator code",
                  required: true,
                },
              ]}
              onSubmit={(d) => enable.mutate(d)}
              busy={enable.isPending}
              error={enable.error?.message}
            />
          </>
        )}
      </section>
    </>
  );
}
