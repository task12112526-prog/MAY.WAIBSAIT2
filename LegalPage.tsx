import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { DownloadRounded } from '@mui/icons-material';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../../i18n';
import { resources } from '../resources/definitions';
import ResourcePage from '../resources/ResourcePage';

type TemplateKey = 'rent-reminder' | 'employee-response' | 'committee-record' | 'lawyer-request';

const templates: { key: TemplateKey; titleKey: string }[] = [
  { key: 'rent-reminder', titleKey: 'rentReminderTemplate' },
  { key: 'employee-response', titleKey: 'employeeResponseTemplate' },
  { key: 'committee-record', titleKey: 'committeeRecordTemplate' },
  { key: 'lawyer-request', titleKey: 'lawyerRequestTemplate' },
];

export default function LegalPage() {
  const { role } = useAuth();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState(0);
  const [templateKey, setTemplateKey] = useState<TemplateKey>('rent-reminder');
  const [values, setValues] = useState({ sender: '', recipient: '', location: '', date: '', reference: '', details: '', deadline: '' });

  const draft = useMemo(() => {
    const fill = (value: string) => value.trim() || `[${locale === 'ur' ? 'درج کریں' : 'Fill in'}]`;
    const data = {
      sender: fill(values.sender),
      recipient: fill(values.recipient),
      location: fill(values.location),
      date: fill(values.date),
      reference: fill(values.reference),
      details: fill(values.details),
      deadline: fill(values.deadline),
    };
    const text = (en: string, ur: string) => locale === 'ur' ? ur : en;
    const subject = {
      'rent-reminder': text('Subject: Rent/account follow-up', 'موضوع: کرایہ/حساب کے بارے میں یاددہانی'),
      'employee-response': text('Subject: Request for your written response', 'موضوع: تحریری جواب کی درخواست'),
      'committee-record': text('Subject: Masjid committee matter record', 'موضوع: مسجد کمیٹی کے معاملے کا ریکارڈ'),
      'lawyer-request': text('Subject: Request for legal review', 'موضوع: قانونی جائزے کی درخواست'),
    }[templateKey];

    return [
      text('DRAFT - Review with a qualified lawyer before sending', 'مسودہ - بھیجنے سے پہلے مستند وکیل سے جائزہ کروائیں'),
      '',
      `${text('Date', 'تاریخ')}: ${data.date}`,
      `${text('From', 'جانب سے')}: ${data.sender}`,
      `${text('To', 'بنام')}: ${data.recipient}`,
      `${text('Location / reference', 'مقام / حوالہ')}: ${data.location}`,
      `${text('Reference number', 'حوالہ نمبر')}: ${data.reference}`,
      subject,
      '',
      templateKey === 'rent-reminder'
        ? text(`Our records show the following matter relating to ${data.location}:`, `ہمارے ریکارڈ کے مطابق ${data.location} سے متعلق درج ذیل معاملہ ہے:`)
        : templateKey === 'employee-response'
          ? text(`We request your response regarding the matter described below. This request is for fact-finding and is not a finding of wrongdoing.`, `ذیل میں بیان کردہ معاملے کے بارے میں آپ کا جواب درکار ہے۔ یہ حقائق معلوم کرنے کی درخواست ہے، کسی غلطی کا حتمی فیصلہ نہیں۔`)
          : templateKey === 'committee-record'
            ? text(`For the committee record, the matter and known facts are noted below. Please keep supporting records securely.`, `کمیٹی کے ریکارڈ کے لیے معاملے اور معلوم حقائق کی تفصیل درج ہے۔ متعلقہ دستاویزات محفوظ رکھیں۔`)
            : text(`Please review the following facts and advise us on the applicable law, documents and next steps before any action is taken.`, `براہِ کرم کسی اقدام سے پہلے درج ذیل حقائق کا جائزہ لے کر متعلقہ قانون، دستاویزات اور اگلے قدم کے بارے میں رہنمائی دیں۔`),
      '',
      `${text('Details', 'تفصیل')}: ${data.details}`,
      '',
      `${text('Requested response / next step by', 'جواب / اگلا قدم مطلوب ہے')}: ${data.deadline}`,
      '',
      text('This is a draft for review. It does not determine legal rights or obligations and should be checked for local law, contract terms and facts.', 'یہ صرف جائزے کے لیے مسودہ ہے۔ اس سے قانونی حقوق یا ذمہ داریوں کا فیصلہ نہیں ہوتا؛ مقامی قانون، معاہدے اور حقائق کے مطابق وکیل سے تصدیق کریں۔'),
      '',
      `${text('Regards', 'خیراندیش')},`,
      data.sender,
    ].join('\n');
  }, [locale, templateKey, values]);

  if (role !== 'admin' && role !== 'mosque_manager') {
    return <Alert severity="error">{t('noPermission')}</Alert>;
  }

  function downloadDraft() {
    const blob = new Blob([draft], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${templateKey}-draft.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <Stack spacing={2.2} className="page-enter">
    <Box>
      <Typography variant="h4" fontWeight={800}>{t('legalMatters')}</Typography>
      <Typography color="text.secondary" mt={0.5}>{t('legalMattersDescription')}</Typography>
    </Box>
    <Alert severity="warning">{t('legalDisclaimer')}</Alert>
    <Tabs value={tab} onChange={(_event, value: number) => setTab(value)} variant="scrollable" allowScrollButtonsMobile>
      <Tab label={t('caseRegister')} />
      <Tab label={t('documentTemplates')} />
      <Tab label={t('generalGuidance')} />
    </Tabs>
    {tab === 0 && <ResourcePage definition={resources.legalMatters} />}
    {tab === 1 && <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={750}>{t('draftTemplate')}</Typography>
          <Alert severity="info">{t('templateReviewNotice')}</Alert>
          <TextField select label={t('templateType')} value={templateKey} onChange={(event) => setTemplateKey(event.target.value as TemplateKey)}>
            {templates.map((template) => <MenuItem key={template.key} value={template.key}>{t(template.titleKey)}</MenuItem>)}
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField fullWidth label={t('sender')} value={values.sender} onChange={(event) => setValues({ ...values, sender: event.target.value })} />
            <TextField fullWidth label={t('recipient')} value={values.recipient} onChange={(event) => setValues({ ...values, recipient: event.target.value })} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField fullWidth label={t('locationReference')} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} />
            <TextField fullWidth label={t('referenceNumber')} value={values.reference} onChange={(event) => setValues({ ...values, reference: event.target.value })} />
            <TextField fullWidth type="date" label={t('date')} value={values.date} onChange={(event) => setValues({ ...values, date: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          <TextField multiline minRows={3} label={t('matterSummary')} value={values.details} onChange={(event) => setValues({ ...values, details: event.target.value })} />
          <TextField type="date" label={t('requestedResponseDate')} value={values.deadline} onChange={(event) => setValues({ ...values, deadline: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField multiline minRows={12} label={t('draftPreview')} value={draft} InputProps={{ readOnly: true }} />
          <Box><Button variant="contained" startIcon={<DownloadRounded />} onClick={downloadDraft}>{t('downloadDraft')}</Button></Box>
        </Stack>
      </CardContent>
    </Card>}
    {tab === 2 && <Card>
      <CardContent>
        <Typography variant="h6" fontWeight={750} mb={1}>{t('generalGuidance')}</Typography>
        <Stack spacing={1.5}>
          <Typography>{t('guidanceRecordFacts')}</Typography>
          <Typography>{t('guidancePreserveDocuments')}</Typography>
          <Typography>{t('guidanceTrackDeadlines')}</Typography>
          <Typography>{t('guidanceLimitSharing')}</Typography>
          <Typography>{t('guidanceConsultLawyer')}</Typography>
          <Alert severity="info">{t('jurisdictionNote')}</Alert>
        </Stack>
      </CardContent>
    </Card>}
  </Stack>;
}
