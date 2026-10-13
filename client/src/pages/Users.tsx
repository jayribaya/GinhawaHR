import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post, text, useSession, type Row } from "../services/api";
import { State } from "./Resources";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/dialog";
import { ResourceForm } from "../components/ResourceForm";
import type { Field } from "../features/resources/config";
export function Users() {
  const actor = useSession((s) => s.actor);
  const manage =
    actor?.permissions.includes("users.write") &&
    actor.permissions.includes("roles.write");
  const cache = useQueryClient(),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [token, setToken] = useState("");
  const query = useQuery({
    queryKey: ["users"],
    queryFn: () => api<Row[]>("/users"),
  });
  const common: Field[] = [
    {
      name: "roleId",
      label: "Role",
      resource: "/roles",
      type: "select",
      required: true,
    },
    {
      name: "departmentIds",
      label: "Authorized department IDs (JSON array)",
      type: "json",
      default: [],
    },
  ];
  const invite = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post<{ invitationToken: string }>("/users/invite", data),
    onSuccess: (response) => {
      setToken(response.data.invitationToken);
      setOpen(false);
      void cache.invalidateQueries();
    },
  });
  const access = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api("/users/" + selected?._id + "/access", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setSelected(null);
      void cache.invalidateQueries();
    },
  });
  const reset = useMutation({
    mutationFn: (id: string) =>
      post<{ invitationToken: string }>("/users/" + id + "/reset-token", {}),
    onSuccess: (result) => setToken(result.data.invitationToken),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>User access</h1>
          <p>
            Invite team members and assign permissions with explicit department
            scope.
          </p>
        </div>
        {manage && <Button onClick={() => setOpen(true)}>Invite user</Button>}
      </div>
      {token && (
        <div className="notice">
          <div>
            <strong>Single-use account token</strong>
            <p>
              Deliver this token securely. It expires in one hour and is
              redeemed on the password recovery page.
            </p>
            <code className="token-display">{token}</code>
            <Button variant="ghost" onClick={() => setToken("")}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
      <div className="card">
        {reset.error && <p className="error padded">{reset.error.message}</p>}
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((row) => (
                <tr key={row._id}>
                  <td>{text(row.name)}</td>
                  <td>{text(row.email)}</td>
                  <td>{text(row.roleId)}</td>
                  <td>{text(row.active)}</td>
                  <td>
                    {manage && (
                      <Button
                        variant="outline"
                        onClick={() => setSelected(row)}
                      >
                        Manage access
                      </Button>
                    )}
                    {actor?.permissions.includes("users.write") && (
                      <Button
                        variant="ghost"
                        disabled={reset.isPending}
                        onClick={() => reset.mutate(row._id)}
                      >
                        Issue reset token
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Invite a team member">
        <ResourceForm
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email", type: "email", required: true },
            ...common,
            {
              name: "employeeId",
              label: "Linked employee (required for self scope)",
              type: "select",
              resource: "/employees",
            },
          ]}
          onSubmit={(d) => invite.mutate(d)}
          busy={invite.isPending}
          error={invite.error?.message}
        />
      </Modal>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelected(null)}
        title="Update access"
      >
        {selected && (
          <ResourceForm
            fields={[
              ...common,
              {
                name: "active",
                label: "Account active",
                type: "checkbox",
                default: true,
              },
            ]}
            initial={{ ...selected, roleId: (selected.roleId as Row)?._id }}
            onSubmit={(d) => access.mutate(d)}
            busy={access.isPending}
            error={access.error?.message}
          />
        )}
      </Modal>
    </>
  );
}
