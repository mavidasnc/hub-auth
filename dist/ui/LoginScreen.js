import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useHubAuth } from '../react/index.js';
import { EmailStep } from './EmailStep.js';
import { OtpStep } from './OtpStep.js';
import { mergeMessages } from './messages.js';
export function LoginScreen({ title, subtitle, logo, footer, messages: custom, resendCooldown, className = '', }) {
    const messages = mergeMessages(custom);
    const { step, notice } = useHubAuth();
    return (_jsxs("div", { className: `hub-auth ${className}`.trim(), children: [_jsxs("div", { className: "hub-auth__card", children: [(logo || title || subtitle) && (_jsxs("header", { className: "hub-auth__header", children: [logo && _jsx("div", { className: "hub-auth__logo", children: logo }), title && _jsx("h1", { className: "hub-auth__title", children: title }), subtitle && _jsx("p", { className: "hub-auth__subtitle", children: subtitle })] })), notice && step === 'email' && (_jsx("p", { className: "hub-auth__notice", role: "status", children: messages.notice[notice] })), step === 'email'
                        ? _jsx(EmailStep, { messages: custom })
                        : _jsx(OtpStep, { messages: custom, resendCooldown: resendCooldown })] }), footer && _jsx("div", { className: "hub-auth__footer", children: footer })] }));
}
