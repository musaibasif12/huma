# Browser QA and repeatable acceptance checks

## HTML directory organization

- Moved all seven HTML files into `pages/`. Shared scripts, styles, and images remain in their existing root folders. Updated HTML asset references plus the rendered brand and downloadable payslip logo paths.
- Page-to-page navigation, login redirects, query parameters and section hashes remain sibling-relative within `pages/`. The new entry point is `/pages/index.html` when serving the repository root. Existing browser data stays on the same origin.
- Updated the foundation asset/link checks to resolve from each page's actual directory and require all seven HTML pages inside `pages/`. All 82 automated checks pass.
- Browser smoke check loaded `/pages/admin.html` with the existing company/session, navigated to `/pages/employees.html` with all four QA employees retained, opened `/pages/index.html?view=admin`, and signed back into `/pages/admin.html`. Logo images loaded and no browser warnings/errors were captured. The clean first-run preview also opened at `/pages/index.html` on its separate origin.

## Dropdown consistency and department categories — 25 October 2026

- Replaced native select popups with one shared Huma control across all seven pages. Menus use neutral surfaces, mint selected/active states, checkmarks, a scrollable list and viewport-aware placement. Underlying native select names/values and existing form/change handlers remain in use.
- Tested employee filtering with End/Enter, Home, Escape cancellation, and prefix typing. Choosing Design filtered to the existing designer; Escape canceled a tentative choice. Typing Operations and confirming restored the Operations rows. Clicking the trigger twice toggled the menu; clicking the page heading dismissed it.
- New employee Department starts with a required placeholder plus six defaults. Submitting otherwise completed fields without a selection showed an inline Choose department message. Existing custom names remain available through the service catalog; a new isolated test preserves Graphic Work unchanged and verifies case-insensitive filtering.
- Added Customer Success through the inline editor, verified duplicate Operations was rejected, and created fictional Casey Categories QA with the new department through the actual employee form. Filtering Customer Success displayed the saved employee. Editing retained that selection. Duplicate-employee email validation remained visible after the department controls were added.
- Added Quality Assurance and canceled the employee dialog; the explicitly saved category appeared immediately in the directory filter and remained available. Enter in the category editor handled Add; Escape closed only that editor. Attempting to save an employee with an unfinished category produced a clear guard message rather than silently ignoring it.
- Checked payroll Paid filtering and Clear filters, including synchronized All payments text. Checked leave-request Approved, company-calendar Extra working day, login Company selection and Employee Personal leave controls. Native popovers render above dialogs rather than clipping inside their scroll areas.
- Checked directory and employee-dialog menus at 1440, 1024, 768, 390 and 320 CSS pixels: all ten open menus stayed within the viewport. Reviewed the final desktop dropdown visually. Browser console contained no warnings/errors.
- Signed into Atlas Shift QA using the new Company selector: its department menu contained the six defaults and did not include Juniper's Customer Success. Returned through the company-specific Employee login and verified the employee leave-type dropdown. Restored the original Admin session afterward.
- All 82 automated checks pass: 12 foundation and 70 application checks. Added tests cover six defaults without writes, legacy names, persistence across reload, case-insensitive duplicates, required/length validation, company/Admin isolation, failed saves and malformed catalog preservation. No storage key, framework, reset or automatic employee data was added.

## Premium shell, mobile navigation and shifts — 25 October 2026

- Applied the dark forest sidebar with subtle gradients, light logo treatment, mint active states and readable profile controls. Auth/setup/company pages now prioritize the form on the left, use a restrained dark visual panel on desktop, and keep the logo above a single-column phone form. Show/hide password controls preserve labels, values and form submission.
- Added role-specific fixed bottom navigation at the existing 800px breakpoint. Verified Admin More, Account and its role-login options, and Smart Helper. The helper input received focus after the sheet closed and its panel bottom remained above the navigation. Mobile Log Out cleared the session; attempting the protected Admin URL returned to login. Existing sidebar account switching continued through real login forms.
- Added default shift end time and custom-date timing metadata to existing company records without a new key or startup migration. Settings showed the existing 09:00 start and 10-minute grace from the original QA company, with a 17:00 fallback. Invalid end-before-start produced an inline error. Saved 18:00, checked the preview, then restored/saved 17:00.
- Added an October 28 custom 10:00–18:00 shift through the modal, edited its end to 18:30, and verified it in the sorted list and Company Calendar's date details. A unique field-ID fix preserves label associations between the policy form and custom-shift modal. Custom timing remains independent of working-day classification.
- Created fictional employee Sam Shift QA through Admin's existing form on the isolated QA origin. Real local time was before 09:00: Check In was disabled with “Check-in opens at 09:00.” No device clock was changed.
- Configured a temporary 00:00–23:59 override for the existing QA Sunday working date, signed in as Sam, and checked in through the live UI. Custom shift/late status was shown and the record/timer survived refresh. Changed that override's end to 00:01 as Admin, then returned as Sam: Check Out remained enabled even though the effective window was closed. Checkout completed the record as one late half day, with the original 00:00–23:59 snapshot preserved. Restored the QA day's custom hours to 09:00–17:00 afterward.
- Verified Employee bottom Attendance and Leaves items navigate to the existing dashboard sections, update the active state and do not add pages. The new employee's monthly history and payroll remained based on actual saved attendance.
- Tested mismatched setup passwords (rejected) and valid company creation for Atlas Shift QA. Its employee directory began empty and Settings showed 09:00–17:00, grace 15 and no copied custom shifts. The redesigned directory distinguished the active workspace and showed employee counts only for its authenticated Admin.
- Opened the new company overflow's deletion confirmation and chose Keep company; no browser company was deleted. Switch workspace opened the selected company's login. Atlas credentials against Juniper were rejected while the Atlas session remained intact; valid Juniper credentials restored its own existing workspace. Invalid password and password-visibility controls were also checked on the redesigned login form.
- Checked Employee dashboard/payslip in 10 viewport/page combinations; Admin overview, employees, leaves, payroll and all Settings panels in 35; and Admin login, Employee login, setup and company directory in 20. All used 1440, 1024, 768, 390 and 320 CSS pixels with no horizontal document overflow. Also inspected clean-origin first-run setup, empty companies and unavailable Employee login at 320px, without creating preview data.
- All 78 automated checks pass: 12 foundation and 66 application checks. New shift tests exercise before/start/end/after boundaries including milliseconds, duplicate check-in/out, post-end checkout, grace and half-day behavior, override CRUD/validation, holiday/weekend precedence, extra working days, snapshot preservation, legacy fallback, company/role isolation, and failed/malformed writes. The earlier policy-snapshot test now checks in at its configured 10:00 start to reflect the new opening restriction.
- Browser console checks returned no warnings/errors. Custom-shift removal was executed in isolated service tests; the real browser's removal dialog was opened and canceled. Physical printing, pure pointer-hover behavior, and browser leave-page warnings remain manual checks. Browser-only shift checks trust the device clock and do not provide tamper-proof attendance security.

## Company settings workspace — 25 October 2026

- Replaced the long combined form and exception table with General, Attendance & Leave, and Company Calendar panels. Desktop uses vertical tabs; mobile uses a scrollable horizontal tab bar. The selected company remains visible above navigation.
- Verified initial Save Changes is disabled. A blank company name produces an inline required-field message. Editing a name enables Save and shows an unsaved indicator. Switched tabs with an unsaved name, saved a grace-period change independently, and returned to the retained name draft. Saving the name updated the toolbar and company context; both saves persisted after reload. Restored the original fictional company name and 10-minute grace period after this check.
- Grace 11 with office start 09:00 displayed a dynamic Late after 09:11 preview. Automated checks also cover midnight rollover, invalid times, blank/negative/fractional grace values, and zero allowance.
- Calendar displayed the existing Sunday working shift and Monday holiday from real saved QA data. Selected a date and verified its title, classification and Edit/Remove actions; arrow-key selection moved into the named holiday. Previous month and Today worked correctly.
- Attempted a second exception on the same date; the existing duplicate protection rejected it inline without replacing the entry. Added a fictional November holiday through the form, verified navigation to its month, then edited its title and verified the updated detail/upcoming list. Opened Remove entry and chose Keep date; service-level removal/restoration remains covered by the existing automated calendar tests. No existing browser records were deleted.
- Verified calendar modal Tab/Shift+Tab containment, Escape dismissal, desktop ArrowDown tab selection, and mobile ArrowRight tab selection. The add-date modal fit at 320px with its Save and Cancel controls visible.
- Checked all three panels at 1440, 1024, 768, 390, and 320 CSS pixels without horizontal document overflow. Calendar labels collapse to dots when the content column is narrow, while full classifications remain in accessible labels and selected-day details. The mobile tab bar scrolls internally.
- Signed into the second company: its 09:00 start, 15-minute grace, 20-day quota and empty calendar were unchanged. Returned to the original company and verified its original exceptions plus the newly created QA holiday remained there. Browser console showed no warnings or errors.
- All 71 automated checks pass: 12 foundation and 59 application checks. New tests cover independent section saves, attendance/leave/payment preservation, policy validation and preview, Admin restrictions, duplicate company names, and multi-company isolation. Existing holiday/workday, leave, attendance, payroll and rollback regressions remain passing. Browser-native leave-page confirmation is implemented; that browser prompt was not separately exercised.

## Payroll workspace redesign — 25 October 2026

This replaces the earlier register-plus-inline-payslip layout described below.

- Added a compact Payroll header with one month selector and Export payroll action, followed by Total Net Payroll, Total Paid, Pending Payments, and Employees Paid. Current-month estimates remain separate from Paid/Unpaid badges. Summary amounts use the existing calculation and saved payment data.
- Simplified employee rows to initials, name, department, right-aligned financial values, payment badge, and View payslip. Search and status filters combine; unmatched results offer Clear filters. Selected rows use the existing soft green treatment.
- Desktop View payslip opens a right-side native dialog covering half the viewport; mobile uses a full-screen panel. Header/close/export controls remain fixed while employee, attendance, salary, payment, and calculation details scroll independently.
- Verified Morgan's recorded Paid amount persisted and opened with separate Paid and Estimated indicators. Canceled a Mark as Unpaid confirmation and verified no change; confirmed Unpaid, then confirmed Paid again. Totals, row badges, recorded amount/date, and detail updated without finalizing the estimated calculation.
- Changed the drawer period to September and verified the main month synchronized and the before-joining empty state appeared. Restored October, closed with Escape, and verified focus returned to View payslip for Morgan. Invalid/blank months clear totals, disable export, and show an actionable message.
- Added explicit Tab/Shift+Tab focus containment after finding that native focus handling could leave the drawer. Rechecked backward and forward wrapping in both the payslip drawer and payment confirmation. Escape from confirmation returns to the payment action; a second Escape closes the drawer and restores the employee row action.
- Verified a search with no match, Clear filters, and the Unpaid filter showing only Riley. Pending Payments was PKR 44,954.55 while recorded paid was PKR 87,954.55; totals matched the existing underlying payroll.
- Checked workspace and open drawer at 1440, 1024, 768, 390, and 320 CSS pixels. No horizontal document/drawer overflow; wide tables scroll internally. Inspected desktop and full-screen phone details visually.
- Download PDF in Morgan's drawer produced the selected employee/month PDF. Export payroll produced the complete selected-month CSV. The dedicated print document contained exactly one selected Morgan statement, with workspace, drawer, backdrop, and controls excluded by print CSS. Native printer/Save as PDF preview remains a manual check; no physical printing was performed.
- Signed in as Riley: My payslip showed only Riley's statement with Print and Download PDF, with no company summary, employee table, or payment management. Signed into the empty second company: all totals were zero, Employees Paid was 0 of 0, Export payroll was disabled, and Add employee was available. Returned to the original company and verified its records remained intact.
- Browser console reported no warnings or errors. All 66 automated checks passed: 12 foundation and 54 application checks, including new summary/payment-estimate separation and combined search/status-filter coverage. Storage keys, payment records, payroll formulas, PDF generation, and role guards are preserved.

## Payroll payment register and downloads — 25 October 2026

- Added the monthly Admin employee payroll register with real salary/deduction/net amounts, Paid/Not paid actions, recorded payment date and amount, totals, and Generate slip per row. The existing payroll engine and print statement remain in use.
- On the isolated QA origin, marked Morgan's October salary Paid. The recorded paid total became PKR 87,954.55, the count became 1 of 2, and the row action became Mark not paid. Reload preserved that status.
- Generated Riley's slip from its row and verified that the employee selector and statement identity changed to Riley, with PKR 44,954.55 net. No Admin register is shown to employees.
- Downloaded a real PDF and CSV through their browser controls. Read the CSV to verify both employee rows, salary/deduction/net amounts, Paid/Not paid statuses, and recorded paid amount. Opened the PDF with a strict PDF reader, confirmed one A4 page, rendered it, and visually inspected its logo, employee identity, attendance, salary, payment status, and estimate notes.
- Reversed Morgan to Not paid and verified totals returned to zero paid, then marked Paid again. Downloaded and rendered the paid statement with the saved amount/date. Checked the register at 1440, 1024, 768, 390, and 320 CSS pixels with no horizontal document overflow; the table scrolls internally on phones. Browser console contained no warnings or errors.
- Verified status reversal, month eligibility, preserved paid amounts after salary changes, ownership/Admin restrictions, company switching, employee deletion cleanup, failed-save rollback, malformed metadata preservation, CSV formula escaping, and PDF binary offsets in automated tests.
- All 64 automated checks pass: 12 foundation and 52 application checks. Downloads use local Blob URLs; there is no new backend, dependency, or storage key.

## Employee workspace and profile menu — 25 October 2026

- Replaced the separate Switch account section with the bottom profile dropdown. Verified desktop click, outside-click dismissal, mobile tap, Employee/Admin login switching, ArrowUp/Down, Home/End, and Escape. Escape closes the submenu before the mobile drawer; closing the drawer also closes the submenu. Existing company and account records remain intact.
- Desktop hover opening, the pointer bridge, and delayed closing are implemented. A physical-pointer hover check remains manual: hover the profile, move into each option, move away, then verify click pinning, outside-click dismissal, and the 180ms transition. Browser automation here exercised click/tap and keyboard rather than pure hover.
- Verified month navigation, Today, selected-day details, keyboard date navigation, approved leave with its reason/comment, a named company holiday, and an extra Sunday working day using actual saved company records. Future dates remain uncounted as absences.
- Created a fictional employee through Admin's existing form on the isolated QA origin. Its empty dashboard showed no invented activity, zero absences before joining, and the actual salary and allowance.
- Checked in on the company's saved extra Sunday shift. The primary action became Check Out and the timer advanced from the saved timestamp across a reload. Submitted leave through the dashboard dialog; it closed and the pending count became one without reducing the approved balance.
- Checked out after 14 seconds. The primary action became disabled Completed for Today; the monthly insights showed one attended day and one included half day. Refresh preserved the 00:00:14 completed duration and disabled action.
- The payroll preview calculated PKR 1,045.45 deductions and PKR 44,954.55 net from the employee's PKR 46,000 base and 22 working days. View Payslip opened October 2026 through the month query parameter and displayed the same figures, scoped to that employee.
- Inspected the employee workspace at 1440, 1024, 768, 390, and 320 CSS pixels. No document overflow; calendar and primary action remain usable, with leave/payroll panels stacked on narrow screens. Reviewed the desktop calendar and small-phone profile dropdown visually.
- Removed unnecessary development labels from product screens while retaining useful storage/security information through About your data and in README.
- All 58 automated checks passed: 12 foundation and 46 application checks. The six added application groups cover leap-year Monday-first grids, future/current/past dates, calendar overrides, approved leave, joining dates, duplicate record handling, employee isolation, saved-timestamp duration, old open records, empty data, and employee-only access.

## huma visual system follow-up — 25 October 2026

- Applied the supplied Slate & Sage reference across shared typography, buttons, form labels, cards, status pills, table rows, navigation, and responsive layouts. Existing workflows and business calculations were retained.
- Replaced the letter-in-a-box logo and dotted wordmark with the supplied transparent Human H artwork and plain huma wordmark on the main page, sidebar, and payslips. All seven favicon references use the same self-contained mark.
- Compared SHA-256 hashes of the source PNG and copied asset; they match. The display SVG embeds the unchanged image with a tighter viewBox, preserving its original transparency and artwork.
- Verified the logo loads in the browser, including both sidebar and payslip logos. Inspected the desktop overview, mobile payslip, employee metric cards, small-phone navigation drawer, and Smart Helper.
- Checked Admin overview, employee directory, leaves, Settings, payslip, and employee dashboard at 1440, 1024, 768, 390, and 320 CSS pixels without horizontal page overflow. The main page received the same responsive checks. Wide salary metrics and small-phone attendance actions stack to remain readable.
- No browser warnings or errors were captured during the visual review. All 52 automated regression checks remain passing. Physical printing remains a separate manual check; the on-screen payslip mark was verified.

## Multi-company follow-up — 25 October 2026

- Opened Manage companies on the isolated QA origin and verified the existing company was listed with its signed-in Admin controls.
- Used Create company to register a second company and Admin. Its dashboard and employee directory began empty, with no records copied from the original.
- Renamed the new company and confirmed the updated name after reload. Inspected the typed-name deletion confirmation and canceled; deletion, including last-company deletion, was verified in isolated automated tests instead of deleting browser data.
- Used the original company’s login link to sign back in. Its employee, half-day attendance record, approved leave/comment, custom holiday, and extra working day were preserved during migration.
- Attempted the original Admin credentials against the second company; an inline company-specific credential error appeared and the original session remained active. Correct second-company credentials opened the second company, whose employee directory remained empty.
- Checked the company directory at 1440, 1024, 768, 390, and 320 CSS pixels with no document overflow. Verified the mobile drawer contains company management/creation links and that Create company opens the correct form at 320px.
- All 52 automated checks passed, including scoped duplicate emails, company/session mismatches, stale-page write protection, legacy migration, malformed registry preservation, and rollback after failed creation or switching.

## Company calendar follow-up — 25 October 2026

- Opened Admin Settings and added a weekday holiday and an extra Sunday working day, using the actual forms on the isolated QA origin. Both persisted after reload.
- Edited the working-day title and verified the saved name. Opened the remove confirmation and canceled; service-level removal and restoration of default working-day behavior passed automated checks.
- Signed in as the employee: the Sunday shift was labeled with its custom title, Check in became available, and the holiday reduced a two-day approved request to one charged day. The remaining balance increased from 18 to 19.
- Checked in and checked out on the real Sunday extra shift without changing the device clock. The immediate checkout produced a half day and disabled both attendance buttons. The payslip showed one attended day, one half day, zero absences, a PKR 2,045.45 deduction, and PKR 87,954.55 net from a PKR 90,000 salary and 22 working days.
- Checked the updated Settings screen at 1440, 1024, 768, 390, and 320 CSS pixels with no horizontal document overflow. Inspected the add-date dialog at 320px and dismissed it with Escape.
- Browser console showed no warnings or errors. All 44 automated checks passed, including malformed/duplicate exceptions, quota/overlap prevention, failed-write rollback, holiday checkout preservation, and the zero-working-day case.

## Account access follow-up — 25 October 2026

- Verified the first-run page shows Company setup, Admin login, and Employee login navigation.
- Opened Employee login before setup and verified the form explains that Admin must first configure the company and create the employee account.
- At this earlier checkpoint, both signed-in sidebars exposed a Switch account section. The employee workspace follow-up above replaces it with the profile dropdown.
- Switched from Employee to Admin login, signed in as Admin, switched to Employee login, and signed in successfully as Employee. Existing salary, leave balance, and approval comments remained intact.
- Verified the account controls remain available inside the navigation drawer at 320px width.
- Added an automated check for role mismatches, role-specific redirects, and workspace preservation when switching accounts. All 35 checks passed.

## Executed browser checks — 24 October 2026

Tests used a separate origin on port 4174 with fictional accounts created through the application forms. Port 4173 was kept as a fresh first-run preview; there is no seeded data in the application source.

- Company and Admin setup redirected to the overview with zero employees and actual zero statistics.
- Employee creation displayed the account in the directory; salary editing persisted without changing its password.
- Searching a nonexistent name showed “No matching employees”; searching the real test name restored the row.
- Company grace period saved as 10 and remained 10 after navigating and reloading.
- Sign-out opened login. Wrong password showed an inline error. Employee and Admin logins opened the correct dashboards.
- Employee requested two future working days; status was pending and the approved balance stayed 20.
- Admin approved with a comment; the review action disappeared and pending count became zero.
- Employee’s reloaded dashboard showed 18 remaining days, 2 used, and the approval comment.
- Employee opening `admin.html` was redirected to `employee.html`.
- Employee payslip had no employee picker. Admin payslip had an employee picker and month input. Current-month figures matched the newly created employee’s zero attended/absent days and displayed the edited base salary.
- Smart Helper returned the employee’s actual edited salary from current data.
- Admin overview, employee directory, leave management, settings, employee dashboard, and payslip were checked at exactly 1440, 1024, 768, 390, and 320 CSS-pixel viewports. No horizontal document overflow was found; tables use internal scrolling.
- Mobile navigation opened and Escape closed it with focus returning to the opener. The 320px employee dialog fit the viewport and Escape dismissed it. The phone chat panel fit the viewport.
- Browser console inspection returned no warnings or errors.

## Remaining manual checks and exact steps

The initial browser QA date was Saturday, and weekend attendance controls were disabled. Later QA executed real check-in/out on a company-configured Sunday extra shift, including timer persistence, immediate half-day classification, and the completed state. Duplicate checks, grace cutoff, saved policy snapshots, and five-hour classification also run against the real service functions in controlled in-memory tests. The remaining full-shift UI check should use a real working day:

1. Create a fictional employee who has no approved leave today. Sign in as them on Monday–Friday.
2. Before check-in, verify the single primary action is Check In.
3. Check in, refresh, and verify the timestamp and running duration persist and the primary action is Check Out.
4. Compare with office start plus grace; the record should say On time or Late as appropriate.
5. Check out immediately: hours should be below five and status should become Half day. Completed for Today should remain disabled after refresh.
6. With a separate account on another working day, complete at least five hours and verify On time/Late remains. Do not adjust the device clock to simulate a full shift.

Print is wired to native `window.print()` with an A4 print stylesheet. Physical printer output and browser Save as PDF remain manual checks:

1. Open a valid payslip; click Print payslip.
2. Verify the preview includes only the statement, salary/attendance breakdown, and calculation notes, with no sidebar, navigation, or chat.
3. Select A4 portrait and Save as PDF or a printer; inspect text wrapping and pagination before saving/printing.

Additional regression checks:

- In Admin’s employee dialog, try an existing email with different casing. Expect an inline duplicate-email error and no new row.
- Filter employees by department; combine the filter with search.
- Open Delete on a disposable employee and verify the confirmation explains attendance/leave deletion. Cancel first; then confirm only if the account is intentionally disposable. Verify other employees remain.
- Submit leave with reversed dates, weekend-only dates, too many days, and an overlapping pending request. Each must be rejected without adding a record.
- Reject a pending request with a comment; verify no quota is consumed. Try reviewing an already-decided request: no review action should remain.
- Select a future payslip month or a month before joining; expect no available payslip and printing disabled.
- As Employee, ask Smart Helper for another person’s salary; expect a privacy response. Ask an unsupported question; expect supported examples.
- Use Tab/Shift+Tab through dialogs and the mobile drawer, then Escape; focus must return to the trigger when it still exists.
- Open the same origin in a second tab, then sign out in one. The other protected page should return to login after the storage event.
- In a disposable test browser profile only, block localStorage or corrupt an `hcm_*` collection. Expect a clear error, blocked writes, and no automatic data reset.
