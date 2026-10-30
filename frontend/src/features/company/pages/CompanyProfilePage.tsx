import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCw, Save, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { MeError } from "../../../app/shell/MeError";
import { usePageTitle } from "../../../app/shell/pageTitle";
import { ForbiddenPage } from "../../../app/shell/StatusPage";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../lib/cn";
import { ApiError } from "../../auth/errors";
import { fieldErrors } from "../../customers/errors";
import { useMe } from "../../me/api";
import {
  companyLogoUrl,
  useCompanyProfile,
  useUpdateCompanyProfile,
  useUploadCompanyLogo,
  type CompanyProfile,
} from "../api";
import {
  companyProfileSchema,
  FIELDS,
  toFormValues,
  toUpdateBody,
  type CompanyProfileFormValues,
} from "../schemas";

const FORM_TITLE = "Thông tin Công ty";

function Waiting() {
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label="Đang tải thông tin Công ty"
      className="h-96 animate-pulse rounded-2xl bg-sidebar-sub"
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError && error.problem.detail
    ? error.problem.detail
    : "Không thực hiện được. Vui lòng thử lại.";
}

function LogoCard({ profile }: { profile: CompanyProfile }) {
  const toast = useToast();
  const upload = useUploadCompanyLogo();
  const input = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setFailure(null);
    try {
      await upload.mutateAsync({ file, version: profile.version });
      toast("Đã cập nhật logo");
    } catch (error) {
      setFailure(errorMessage(error));
    }
  }

  return (
    <section className="space-y-4 rounded-2xl bg-card p-5 shadow-card md:p-7">
      <h2 className="text-base font-semibold text-heading">Logo</h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {profile.logo_attachment_id ? (
          <img
            src={companyLogoUrl(profile.logo_attachment_id)}
            alt="Logo Công ty"
            className="max-h-[120px] w-auto max-w-full self-start object-contain bg-red-500"
          />
        ) : (
          <p className="text-sm text-muted">Chưa có logo</p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            void onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="sm:ml-auto"
          icon={<Upload aria-hidden="true" className="size-4" />}
          loading={upload.isPending}
          onClick={() => input.current?.click()}
        >
          Tải logo
        </Button>
      </div>
      {failure ? <Alert>{failure}</Alert> : null}
    </section>
  );
}

function ProfileForm({
  profile,
  onReload,
}: {
  profile: CompanyProfile;
  onReload: () => Promise<CompanyProfile | undefined>;
}) {
  const toast = useToast();
  const update = useUpdateCompanyProfile();
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [showReload, setShowReload] = useState(false);
  const { register, handleSubmit, formState, reset } = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema) as Resolver<CompanyProfileFormValues>,
    mode: "onChange",
    // Not `values`: a new logo bumps `version` and refreshes `profile`, which must not wipe what the
    // user is typing — the form is reset only after a save or an explicit "Tải lại".
    defaultValues: toFormValues(profile),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormMessage(null);
    setServerErrors({});
    try {
      const saved = await update.mutateAsync(
        toUpdateBody(values, formState.dirtyFields, profile.version),
      );
      reset(toFormValues(saved));
      toast("Đã lưu thông tin Công ty");
    } catch (error) {
      if (error instanceof ApiError && error.problem.code === "STALE_VERSION") setShowReload(true);
      setFormMessage(errorMessage(error));
      setServerErrors(fieldErrors(error));
    }
  });

  async function reload() {
    const fresh = await onReload();
    if (fresh) reset(toFormValues(fresh));
    setShowReload(false);
    setFormMessage(null);
    setServerErrors({});
  }

  return (
    <form
      aria-label={FORM_TITLE}
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="space-y-5 rounded-2xl bg-card p-5 shadow-card md:p-7"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.name} className={cn(field.wide && "md:col-span-2")}>
            <TextField
              label={field.label}
              error={formState.errors[field.name]?.message ?? serverErrors[field.name]}
              {...register(field.name)}
            />
          </div>
        ))}
      </div>
      {formMessage ? <Alert>{formMessage}</Alert> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {showReload ? (
          <Button
            type="button"
            variant="secondary"
            icon={<RotateCw aria-hidden="true" className="size-4" />}
            onClick={() => void reload()}
          >
            Tải lại
          </Button>
        ) : null}
        <Button
          type="submit"
          icon={<Save aria-hidden="true" className="size-4" />}
          loading={update.isPending}
          // Not `isValid`: it lags one change behind after a single programmatic input (paste/autofill).
          // Loaded data is valid, and `mode: "onChange"` flags every bad edit at once.
          disabled={!formState.isDirty || Object.keys(formState.errors).length > 0}
        >
          Lưu
        </Button>
      </div>
    </form>
  );
}

/** Thông tin Công ty (M17-01): the single company record, Manager-only. */
export function CompanyProfilePage() {
  usePageTitle(FORM_TITLE);
  const me = useMe();
  const allowed = me.data !== undefined && "company.manage" in me.data.capabilities;
  const profile = useCompanyProfile(allowed);

  if (!me.data && me.isError) {
    return (
      <MeError
        onRetry={() => {
          void me.refetch();
        }}
      />
    );
  }
  if (!me.data) return <Waiting />;
  if (!allowed) return <ForbiddenPage />;
  if (profile.isError && !profile.data) {
    return (
      <div className="space-y-3 rounded-2xl bg-card p-5 shadow-card md:p-7">
        <Alert>Không tải được thông tin Công ty.</Alert>
        <Button
          type="button"
          variant="secondary"
          icon={<RotateCw aria-hidden="true" className="size-4" />}
          onClick={() => void profile.refetch()}
        >
          Thử lại
        </Button>
      </div>
    );
  }
  if (!profile.data) return <Waiting />;

  return (
    <div className="space-y-4 lg:max-w-4xl">
      <LogoCard profile={profile.data} />
      <ProfileForm profile={profile.data} onReload={async () => (await profile.refetch()).data} />
    </div>
  );
}
