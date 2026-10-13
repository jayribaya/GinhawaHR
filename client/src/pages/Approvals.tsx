import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post, text, useSession, type Row } from "../services/api";
import { State } from "./Resources";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/dialog";
import { ResourceForm } from "../components/ResourceForm";
export function AttendanceApprovals() {
  const cache = useQueryClient(),
    [decision, setDecision] = useState<{ row: Row; value: string } | null>(
      null,
    );
  const query = useQuery({
    queryKey: ["adjustments"],
    queryFn: () => api<Row[]>("/attendance/adjustments"),
  });
  const approve = useMutation({
    mutationFn: () =>
      post("/attendance/adjustments/" + decision?.row._id + "/decision", {
        decision: decision?.value,
      }),
    onSuccess: () => {
      setDecision(null);
      void cache.invalidateQueries();
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Attendance approvals</h1>
          <p>Review correction reasons before updating unlocked attendance.</p>
        </div>
      </div>
      <div className="card">
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Clock in (UTC)</th>
                <th>Clock out (UTC)</th>
                <th>Reason</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((row) => (
                <tr key={row._id}>
                  <td>{text(row.employeeId)}</td>
                  <td>{text(row.clockIn)}</td>
                  <td>{text(row.clockOut)}</td>
                  <td>{text(row.reason)}</td>
                  <td>
                    <span className="badge">{text(row.status)}</span>
                  </td>
                  <td>
                    {row.status === "Pending" && (
                      <div className="inline-actions">
                        <Button
                          onClick={() =>
                            setDecision({ row, value: "Approved" })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setDecision({ row, value: "Rejected" })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal
        open={Boolean(decision)}
        onOpenChange={(v) => !v && setDecision(null)}
        title={`${decision?.value === "Approved" ? "Approve" : "Reject"} correction`}
      >
        <p>Reason: {text(decision?.row.reason)}</p>
        <p>
          This decision updates the audit trail. Locked attendance cannot be
          changed.
        </p>
        {approve.error && <p className="error">{approve.error.message}</p>}
        <div className="form-actions">
          <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
            Confirm decision
          </Button>
        </div>
      </Modal>
    </>
  );
}
export function LeaveBalances() {
  const actor = useSession((s) => s.actor);
  const cache = useQueryClient(),
    [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["leave-balances"],
    queryFn: () => api<Row[]>("/leave/balances/list"),
  });
  const adjust = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post("/leave/balances/adjust", data),
    onSuccess: () => {
      setOpen(false);
      void cache.invalidateQueries();
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Leave balances</h1>
          <p>Credits are tracked through an adjustment ledger.</p>
        </div>
        {actor?.scope === "company" &&
          actor.permissions.includes("leave.approve") && (
            <Button onClick={() => setOpen(true)}>Adjust balance</Button>
          )}
      </div>
      <div className="card">
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave policy</th>
                <th>Available days</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((row) => (
                <tr key={row._id}>
                  <td>{text(row.employeeId)}</td>
                  <td>{text(row.leaveTypeId)}</td>
                  <td>{text(row.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Adjust leave credits">
        <ResourceForm
          fields={[
            {
              name: "employeeId",
              label: "Employee",
              resource: "/employees",
              type: "select",
              required: true,
            },
            {
              name: "leaveTypeId",
              label: "Leave policy",
              resource: "/leave-types",
              type: "select",
              required: true,
            },
            {
              name: "units",
              label: "Days to add or deduct",
              type: "number",
              required: true,
            },
            { name: "reason", label: "Adjustment reason", required: true },
          ]}
          onSubmit={(d) => adjust.mutate(d)}
          busy={adjust.isPending}
          error={adjust.error?.message}
        />
      </Modal>
    </>
  );
}
