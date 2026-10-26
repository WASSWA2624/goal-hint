import {resolveDiscoveryPolicy} from '@/domain/discovery';
// Synthetic release evidence belongs only to this isolated acceptance app.
export const policy=()=>resolveDiscoveryPolicy({deployment:process.env.SEO_ACCEPTANCE_ENVIRONMENT,runtime:process.env.NODE_ENV,releaseVerified:true});
