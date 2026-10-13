import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowUpRight, ShieldAlert } from "lucide-react";
import { api, post, useSession, text, money, type Row } from "../services/api";
import { State } from "./Resources";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/dialog";
import { ResourceForm } from "../components/ResourceForm";
export function Payroll() {
  const actor = useSession((s) => s.actor),
    navigate = useNavigate(),
    cache = useQueryClient(),
    [open, setOpen] = useState(false);
  const allowed =
    actor?.scope === "company" && actor.permissions.includes("payroll.read");
  const query = useQuery({
    queryKey: ["payroll"],
    queryFn: () => api<Row[]>("/payroll"),
    enabled: allowed,
  });
  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post<Row>("/payroll", data, { "idempotency-key": crypto.randomUUID() }),
    onSuccess: (result) => {
      void cache.invalidateQueries();
      navigate("/payroll/" + result.data._id);
    },
  });
  if (!allowed)
    return (
      <State
        error={
          new Error(
            "Company payroll access is required. Your released payslips are available in Payslips.",
          )
        }
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PAYROLL WORKSPACE</div>
          <h1>Payroll, with peace of mind</h1>
          <p>
            Prepare, review and approve each cutoff with a clear audit trail.
          </p>
        </div>
        {actor.permissions.includes("payroll.prepare") && (
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            New payroll run
          </Button>
        )}
      </div>
      <div className="notice">
        <ShieldAlert size={20} />
        <div>
          <strong>Statutory verification required</strong>
          <p>
            Calculation previews are available. Production finalization is
            blocked until complete official policies and payroll methods have
            been implemented and reviewed.
          </p>
          <Link to="/statutory">View statutory policies →</Link>
        </div>
      </div>
      <div className="card">
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        {query.data?.data.length !== 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Payroll period</th>
                  <th>Run ID</th>
                  <th>Status</th>
                  <th>Gross</th>
                  <th>Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data?.data.map((run) => (
                  <tr key={run._id}>
                    <td>{text(run.periodId)}</td>
                    <td>
                      <code>{String(run.runNumber).slice(0, 14)}…</code>
                    </td>
                    <td>
                      <span className="badge">{text(run.status)}</span>
                    </td>
                    <td>{money(run.gross)}</td>
                    <td>{money(run.net)}</td>
                    <td>
                      <Link className="table-link" to={"/payroll/" + run._id}>
                        Open <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Start payroll run">
        <ResourceForm
          fields={[
            {
              name: "periodId",
              label: "Payroll cutoff",
              type: "select",
              resource: "/payroll-periods",
              required: true,
            },
          ]}
          onSubmit={(d) => create.mutate(d)}
          busy={create.isPending}
          error={create.error?.message}
        />
      </Modal>
    </>
  );
}
export function PayrollDetail() {
  const { id } = useParams(),
    actor = useSession((s) => s.actor),
    cache = useQueryClient(),
    [target, setTarget] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["payroll", id],
    queryFn: () => api<{ run: Row; items: Row[] }>("/payroll/" + id),
  });
  const run = query.data?.data.run;
  const mutate = useMutation({
    mutationFn: ({ action, reason }: { action: string; reason?: string }) =>
      post(
        "/payroll/" +
          id +
          (action === "Calculated" ? "/calculate" : "/transition"),
        action === "Calculated"
          ? { revision: run?.revision }
          : { status: action, revision: run?.revision, reason },
      ),
    onSuccess: () => {
      setTarget(null);
      void cache.invalidateQueries();
    },
  });
  const steps = [
    "Draft",
    "Calculated",
    "Under Review",
    "Approved",
    "Finalized",
    "Paid",
  ];
  const canPrepare = actor?.permissions.includes("payroll.prepare"),
    canApprove = actor?.permissions.includes("payroll.approve");
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PAYROLL RUN</div>
          <h1>{run ? text((run.periodId as Row)?.name) : "Payroll detail"}</h1>
          <p>{text(run?.runNumber)}</p>
        </div>
        <Link to="/payroll" className="table-link">
          All payroll runs
        </Link>
      </div>
      <State loading={query.isPending} error={query.error} />
      {run && (
        <>
          <div className="workflow-steps">
            {steps.map((step, i) => (
              <div
                key={step}
                className={
                  i <= steps.indexOf(String(run.status)) ? "complete" : ""
                }
              >
                <span>{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
          <div className="stats-grid payroll-stats">
            <div className="stat-card">
              <span>Gross earnings</span>
              <strong>{money(run.gross)}</strong>
            </div>
            <div className="stat-card">
              <span>Net pay</span>
              <strong>{money(run.net)}</strong>
            </div>
            <div className="stat-card">
              <span>Employees calculated</span>
              <strong>{query.data?.data.items.length}</strong>
            </div>
            <div className="stat-card">
              <span>Current status</span>
              <h2>{text(run.status)}</h2>
              <small>Revision {text(run.revision)}</small>
            </div>
          </div>
          {Array.isArray(run.exceptions) && run.exceptions.length > 0 && (
            <div className="notice">
              <ShieldAlert size={20} />
              <div>
                <strong>Finalization blockers</strong>
                <ul>
                  {run.exceptions.map((e) => (
                    <li key={String(e)}>{String(e).replaceAll("_", " ")}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="card padded">
            <div className="section-heading">
              <h2>Employee breakdown</h2>
              <div className="inline-actions">
                {["Draft", "Rejected"].includes(String(run.status)) &&
                  canPrepare && (
                    <Button
                      disabled={mutate.isPending}
                      onClick={() => mutate.mutate({ action: "Calculated" })}
                    >
                      Calculate payroll
                    </Button>
                  )}
                {run.status === "Calculated" && canPrepare && (
                  <Button onClick={() => setTarget("Under Review")}>
                    Submit for review
                  </Button>
                )}
                {run.status === "Under Review" && canApprove && (
                  <>
                    <Button onClick={() => setTarget("Approved")}>
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setTarget("Rejected")}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {run.status === "Approved" &&
                  actor?.permissions.includes("payroll.finalize") && (
                    <Button onClick={() => setTarget("Finalized")}>
                      Finalize
                    </Button>
                  )}
              </div>
            </div>
            {mutate.error && (
              <p className="error" role="alert">
                {mutate.error.message}
              </p>
            )}
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Gross</th>
                    <th>Contributions</th>
                    <th>Tax</th>
                    <th>Deductions</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.data.items.map((item) => {
                    const snapshot = item.snapshot as {
                        employee: { firstName: string; lastName: string };
                      },
                      result = item.result as Record<string, string>;
                    return (
                      <tr key={item._id}>
                        <td>
                          {snapshot.employee.firstName}{" "}
                          {snapshot.employee.lastName}
                        </td>
                        {[
                          "gross",
                          "contributions",
                          "tax",
                          "deductions",
                          "net",
                        ].map((k) => (
                          <td key={k}>{money(result[k])}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!query.data?.data.items.length && <State empty />}
          </div>
        </>
      )}
      <Modal
        open={Boolean(target)}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`${target} payroll`}
      >
        <p>
          Changes are audited. Finalization requires zero blocking exceptions
          and independent approval.
        </p>
        <ResourceForm
          fields={[
            { name: "reason", label: "Decision reason", required: true },
          ]}
          onSubmit={(d) =>
            mutate.mutate({ action: target!, reason: String(d.reason) })
          }
          busy={mutate.isPending}
          error={mutate.error?.message}
        />
      </Modal>
    </>
  );
}
