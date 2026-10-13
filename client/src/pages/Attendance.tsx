import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, post, text, useSession, type Row } from "../services/api";
import { State } from "./Resources";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/dialog";
import { ResourceForm } from "../components/ResourceForm";
export function Attendance() {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [adjust, setAdjust] = useState<Row | null>(null);
  const [importOpen, setImportOpen] = useState(false),
    [csvFile, setCsvFile] = useState(""),
    [importReason, setImportReason] = useState(""),
    [fileError, setFileError] = useState("");
  const actor = useSession((s) => s.actor),
    cache = useQueryClient();
  const query = useQuery({
    queryKey: ["attendance", from, to],
    queryFn: () =>
      api<Row[]>(
        `/attendance?${from ? "from=" + from + "&" : ""}${to ? "to=" + to : ""}`,
      ),
  });
  const clock = useMutation({
    mutationFn: (action: string) => post("/attendance/clock", { action }),
    onSuccess: () => void cache.invalidateQueries(),
  });
  const importCsv = useMutation({
    mutationFn: () =>
      post("/attendance/import", { csv: csvFile, reason: importReason }),
    onSuccess: () => {
      setImportOpen(false);
      setCsvFile("");
      void cache.invalidateQueries();
    },
  });
  const adjustment = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      post("/attendance/adjustments", {
        ...data,
        attendanceId: adjust?._id,
        clockIn: new Date(String(data.clockIn)).toISOString(),
        clockOut: new Date(String(data.clockOut)).toISOString(),
      }),
    onSuccess: () => {
      setAdjust(null);
      void cache.invalidateQueries();
    },
  });
  const time = (value: unknown) =>
    value
      ? new Intl.DateTimeFormat("en-PH", {
          timeZone: "Asia/Manila",
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(String(value)))
      : "—";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TIME & ATTENDANCE</div>
          <h1>Every workday counts</h1>
          <p>Clock events are stored in UTC and displayed in Asia/Manila.</p>
        </div>
        {actor?.scope === "company" &&
          actor.permissions.includes("attendance.write") && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Import attendance CSV
            </Button>
          )}
        {actor?.employeeId &&
          actor.permissions.includes("attendance.write") && (
            <div className="inline-actions">
              <Button
                disabled={clock.isPending}
                onClick={() => clock.mutate("in")}
              >
                Clock in
              </Button>
              <Button
                variant="outline"
                disabled={clock.isPending}
                onClick={() => clock.mutate("out")}
              >
                Clock out
              </Button>
            </div>
          )}
      </div>
      {clock.error && (
        <p className="error" role="alert">
          {clock.error.message}
        </p>
      )}
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
        </div>
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
                  <th>Employee</th>
                  <th>Day</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Recorded minutes</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data?.data.map((row) => (
                  <tr key={row._id}>
                    <td>{text(row.employeeId)}</td>
                    <td>{text(row.day)}</td>
                    <td>{time(row.clockIn)}</td>
                    <td>{time(row.clockOut)}</td>
                    <td>{text(row.workedMinutes)}</td>
                    <td>{text(row.source)}</td>
                    <td>
                      {actor?.permissions.includes("attendance.write") &&
                        !row.lockedRunId && (
                          <Button
                            variant="ghost"
                            onClick={() => setAdjust(row)}
                          >
                            Request correction
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal
        open={Boolean(adjust)}
        onOpenChange={(open) => !open && setAdjust(null)}
        title="Request attendance correction"
      >
        <ResourceForm
          fields={[
            {
              name: "clockIn",
              label: "Clock in (ISO timestamp with UTC offset)",
              required: true,
            },
            {
              name: "clockOut",
              label: "Clock out (ISO timestamp with UTC offset)",
              required: true,
            },
            { name: "reason", label: "Correction reason", required: true },
          ]}
          onSubmit={(d) => adjustment.mutate(d)}
          busy={adjustment.isPending}
          error={adjustment.error?.message}
        />
      </Modal>
      <Modal
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import attendance records"
      >
        <p className="subtle">
          CSV headers: employeeNumber,clockIn,clockOut. Timestamps must include
          UTC or an explicit offset. Duplicate records and locked periods are
          rejected. All rows import atomically.
        </p>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            importCsv.mutate();
          }}
        >
          <label className="wide">
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 900000) {
                    setFileError("File must be under 900 KB");
                    setCsvFile("");
                  } else
                    void file.text().then((value) => {
                      setCsvFile(value);
                      setFileError("");
                    });
                }
              }}
            />
          </label>
          <label className="wide">
            Import reason
            <input
              required
              minLength={3}
              value={importReason}
              onChange={(e) => setImportReason(e.target.value)}
            />
          </label>
          {(fileError || importCsv.error) && (
            <p className="error wide">
              {fileError || importCsv.error?.message}
            </p>
          )}
          <div className="form-actions wide">
            <Button disabled={importCsv.isPending || !csvFile}>
              Import records
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
