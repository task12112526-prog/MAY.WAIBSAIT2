import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export default function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2} mb={3} sx={{ position: 'relative', pl: { xs: 1.5, sm: 2 }, py: 0.6, '&::before': { content: '""', position: 'absolute', insetInlineStart: 0, top: 3, bottom: 3, width: 4, borderRadius: 4, background: 'linear-gradient(180deg, #c49642, #176b55)' } }}>
    <Box><Typography variant="h4" fontSize={{ xs: 25, sm: 30 }}>{title}</Typography>{description && <Typography color="text.secondary" mt={0.7} fontSize={14}>{description}</Typography>}</Box>
    {action && <Box flexShrink={0}>{action}</Box>}
  </Stack>;
}

export function SummaryCard({ label, value, caption, icon, tint }: { label: string; value: string; caption?: string; icon: ReactNode; tint: string }) {
  return <Box sx={{ height: '100%', p: 2.3, borderRadius: 4, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 8px 26px rgba(22,58,43,.035)', transition: 'transform .2s ease, box-shadow .2s ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 16px 34px rgba(22,58,43,.09)' } }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between">
      <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 2.8, color: 'primary.main', bgcolor: tint, '& svg': { fontSize: 23 } }}>{icon}</Box>
      {caption && <Typography variant="caption" color="text.secondary">{caption}</Typography>}
    </Stack>
    <Typography color="text.secondary" variant="body2" mt={2.2} fontWeight={550}>{label}</Typography>
    <Typography variant="h5" mt={0.7} fontSize={{ xs: 22, sm: 25 }}>{value}</Typography>
  </Box>;
}
