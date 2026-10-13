import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  post,
  download,
  text,
  money,
  useSession,
  type Row,
} from "../services/api";
import { State } from "./Resources";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/dialog";
import { ResourceForm } from "../components/ResourceForm";
export function Payslips() {
  const query = useQuery({
      queryKey: ["payslips"],
      queryFn: () => api<Row[]>("/payslips"),
    }),
    actor = useSession((s) => s.actor),
    cache = useQueryClient(),
    [error, setError] = useState("");
  const action = async (row: Row, release = false) => {
    try {
      setError("");
      if (release) {
        await post("/payslips/" + row._id + "/release", {});
        await cache.invalidateQueries();
      } else
        await download(
          "/payslips/" + row._id + "/pdf",
          "GinhawaHR-payslip.pdf",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PAY & DOCUMENTS</div>
          <h1>Your payslips</h1>
          <p>Securely download released, finalized payroll documents.</p>
        </div>
      </div>
      <div className="card padded">
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        {error && <p className="error">{error}</p>}
        {query.data?.data.map((row) => (
          <div className="timeline-row" key={row._id}>
            <strong>{text(row.runId)}</strong>
            <span>{row.releasedAt ? "Released" : "Awaiting release"}</span>
            <Button variant="outline" onClick={() => void action(row)}>
              Download PDF
            </Button>
            {!row.releasedAt &&
              actor?.permissions.includes("payslips.release") && (
                <Button onClick={() => void action(row, true)}>
                  Release payslip
                </Button>
              )}
          </div>
        ))}
      </div>
    </>
  );
}
export function Notifications() {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Row[]>("/notifications"),
  });
  const mark = useMutation({
    mutationFn: (id: string) =>
      api("/notifications/" + id + "/read", { method: "PATCH", body: "{}" }),
    onSuccess: () => void cache.invalidateQueries(),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>Approvals, payslip releases and updates for you.</p>
        </div>
      </div>
      <div className="card padded">
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        {mark.error && <p className="error">{mark.error.message}</p>}
        {query.data?.data.map((n) => (
          <div className="timeline-row" key={n._id}>
            <strong>{text(n.title)}</strong>
            <span>{text(n.createdAt)}</span>
            {!n.readAt && (
              <Button variant="outline" onClick={() => mark.mutate(n._id)}>
                Mark read
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
export function Reports() {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState("");
  const path = `/reports/payroll?${from ? "from=" + from + "&" : ""}${to ? "to=" + to + "&" : ""}`;
  const query = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => api<Row[]>(path),
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Payroll reports</h1>
          <p>
            Server-authorized register exports, protected against spreadsheet
            formula injection.
          </p>
        </div>
        <Button
          onClick={() =>
            void download(path + "format=csv", "GinhawaHR-register.csv").catch(
              (e) => setError(e.message),
            )
          }
        >
          Export CSV
        </Button>
      </div>
      <div className="card">
        <div className="table-toolbar">
          <label>
            From{" "}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        {error && <p className="error padded">{error}</p>}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Gross</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.data.map((r) => (
                <tr key={r._id}>
                  <td>{text(r.runNumber)}</td>
                  <td>{text(r.status)}</td>
                  <td>{money(r.gross)}</td>
                  <td>{money(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
export function Payments() {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [error, setError] = useState(""),
    actor = useSession((s) => s.actor),
    cache = useQueryClient();
  const query = useQuery({
    queryKey: ["payments"],
    queryFn: () => api<Row[]>("/payments"),
  });
  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) => post("/payments", data),
    onSuccess: () => {
      setOpen(false);
      void cache.invalidateQueries();
    },
  });
  const action = async (row: Row, action: string, data: unknown = {}) => {
    try {
      setError("");
      if (action === "export")
        await download(
          "/payments/" + row._id + "/export",
          "GinhawaHR-payments.csv",
          "POST",
        );
      else await post("/payments/" + row._id + "/" + action, data);
      setSelected(null);
      await cache.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Payment batches</h1>
          <p>
            Prepare payout records and reconcile externally confirmed
            disbursements.
          </p>
        </div>
        {actor?.permissions.includes("payments.write") && (
          <Button onClick={() => setOpen(true)}>Create batch</Button>
        )}
      </div>
      <div className="notice">
        <p>
          Exports are generic payout CSVs, subject to bank format validation. No
          bank transfer is performed. A batch can only be exported once.
        </p>
      </div>
      <div className="card padded">
        <State
          loading={query.isPending}
          error={query.error}
          empty={query.data?.data.length === 0}
        />
        {error && <p className="error">{error}</p>}
        {query.data?.data.map((row) => (
          <div className="timeline-row" key={row._id}>
            <strong>{text(row.runId)}</strong>
            <span className="badge">{text(row.status)}</span>
            {row.status === "Prepared" &&
              actor?.permissions.includes("payments.approve") && (
                <Button onClick={() => void action(row, "approve")}>
                  Approve
                </Button>
              )}
            {row.status === "Approved" &&
              actor?.permissions.includes("payments.write") && (
                <Button onClick={() => void action(row, "export")}>
                  Export instructions
                </Button>
              )}
            {row.status === "Exported" &&
              actor?.permissions.includes("payments.approve") && (
                <Button onClick={() => setSelected(row)}>Reconcile</Button>
              )}
          </div>
        ))}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Create payout batch">
        <ResourceForm
          fields={[
            {
              name: "runId",
              label: "Finalized payroll run ID",
              required: true,
            },
          ]}
          onSubmit={(d) => create.mutate(d)}
          busy={create.isPending}
          error={create.error?.message}
        />
      </Modal>
      <Modal
        open={Boolean(selected)}
        onOpenChange={(v) => !v && setSelected(null)}
        title="Confirm reconciliation"
      >
        <ResourceForm
          fields={[
            {
              name: "reference",
              label: "External payment reference",
              required: true,
            },
          ]}
          onSubmit={(d) => void action(selected!, "reconcile", d)}
          busy={false}
          error={error}
        />
      </Modal>
    </>
  );
}
