import {createDiscoveryProxy} from '@/server/seo/proxy';
import {policy} from './app/policy';
export const proxy=createDiscoveryProxy(policy);
export const config={matcher:['/((?!api(?:/|$)|_next(?:/|$)|brand(?:/|$)|.*\\.).*)']};
