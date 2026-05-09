// Curated autonomous vehicle knowledge base injected into every Qwen agent
// reasoning pass. Keep concise, technical, and standards-anchored — this is
// prepended to the system prompt so token budget matters.

export const AV_KNOWLEDGE_BASE = `
=== AV KNOWLEDGE BASE (reference for reasoning) ===

# 1. Autonomy Levels (SAE J3016)
- L0: No automation. Human drives.
- L1: Driver assistance (ACC OR lane-keep, not both).
- L2: Partial automation (ACC + lane-keep). Human monitors. (Tesla Autopilot, GM Super Cruise base, Ford BlueCruise.)
- L3: Conditional automation. System drives in ODD; human is fallback when prompted. (Mercedes Drive Pilot, Honda Sensing Elite.)
- L4: High automation within a defined ODD; no human fallback required. (Waymo, Cruise, Zoox, Mobileye Drive.)
- L5: Full automation, any ODD.

# 2. AV Stack Architecture
- Sensing: cameras (mono/stereo), radar (24/77 GHz, 4D imaging), LiDAR (mechanical, MEMS, FMCW, solid-state), ultrasonic, IMU, GNSS/RTK, V2X (DSRC/C-V2X PC5).
- Perception: object detection (YOLO/DETR/CenterPoint), segmentation (BEVFormer, BEVFusion), tracking (SORT/ByteTrack), free-space, lane/sign detection, traffic light state.
- Localization: HD map matching, SLAM (LIO-SAM, ORB-SLAM3), GNSS+IMU fusion, NDT/ICP scan matching.
- Prediction: trajectory forecasting (motion transformers, VectorNet, TNT), intent classification.
- Planning: behavior planner (FSM/POMDP), motion planner (lattice, RRT*, MPC, MPPI), decision under uncertainty.
- Control: lateral (Stanley, pure pursuit, MPC), longitudinal (PID, MPC), actuator interface (ISO 11898 CAN, AUTOSAR).
- Compute: NVIDIA DRIVE Orin/Thor, Mobileye EyeQ6, Qualcomm Ride, Tesla FSD HW4, Horizon Journey 5/6.
- Middleware: ROS 2, Cyber RT (Apollo), DDS, Autoware, Apex.OS.

# 3. Safety Standards & Regulation
- ISO 26262 — Functional Safety for road vehicles. ASIL A–D risk classification (S×E×C). Hazard analysis (HARA), safety goals, FMEA, FTA.
- ISO 21448 (SOTIF) — Safety Of The Intended Functionality. Addresses performance limitations of perception/decision under triggering conditions (fog, edge cases, sensor blooming).
- ISO/SAE 21434 — Cybersecurity engineering. TARA (Threat Analysis & Risk Assessment).
- ISO/PAS 21448, ISO 34501–34505 — AV test scenarios taxonomy.
- UN R155 / R156 — Cybersecurity Management System (CSMS) and Software Update Management System (SUMS).
- UN R157 — Automated Lane Keeping Systems (ALKS) up to 130 km/h. Defines minimum risk maneuver, DDT fallback, DSSAD.
- UN R152 — AEBS for M1/N1.
- FMVSS (US) — 49 CFR Part 571. NHTSA Standing General Order 2021-01 mandates crash reporting for L2+ ADAS within 1 day (serious) / 5 days.
- NHTSA AV TEST Initiative; AV 4.0 policy framework.
- California DMV: AV Tester Permit, Driverless Deployment Permit, mandatory disengagement reports (Title 13 §227).
- EU GSR (General Safety Regulation 2019/2144) — mandatory ADAS since 2022 (ISA, AEB, DDAW, lane-keeping).

# 4. Operational Design Domain (ODD)
Defined by: roadway type, speed range, time-of-day, weather (rain rate, visibility, snow, fog), geography (geofence), traffic conditions, infrastructure (lane markings, signage), connectivity. ODD exit triggers DDT fallback → minimum risk condition (MRC).

# 5. Failure Modes & Root Cause Categories
- Sensor: occlusion, calibration drift, sensor blinding (sun, headlights), weather degradation, hardware fault, sync/timing skew, intrinsic noise.
- Perception: false negative (missed pedestrian/cyclist/VRU), false positive (phantom braking), misclassification, range error, tracking ID switch, late detection.
- Prediction: incorrect intent, ignored cut-in, missed yield behavior.
- Planning: unsafe gap acceptance, late lane change, frozen robot problem, deadlock at unprotected left, oscillating path.
- Control: actuator latency, oversteer/understeer, brake fade, lateral overshoot.
- Map/Localization: stale HD map, lane geometry mismatch, GNSS multipath in urban canyon, incorrect localization in tunnels.
- HMI / Driver: mode confusion (L2 misuse), late takeover, hands-off detection bypass.
- Software: race condition, message drop (DDS QoS), regression after OTA, watchdog reset.
- Cybersecurity: GPS spoofing, CAN bus injection, adversarial patches on signs.
- Environmental: construction zones, emergency vehicles, unusual VRUs (e-scooters), animal incursion, road debris, glare.

# 6. Notable Real-World Incidents (precedent for analysis)
- Uber ATG, Tempe AZ 2018: pedestrian fatality. Root cause: classification flip-flop (vehicle/bicycle/unknown), suppressed AEB, inattentive safety driver, no pedestrian-as-jaywalker model.
- Tesla Autopilot Williston FL 2016 & Delray FL 2019: failure to detect crossing tractor-trailer (radar gating + camera).
- Cruise SF Oct 2023: pedestrian struck by other vehicle then dragged ~6 m by Cruise AV during pullover; ODD/MRC and incident response failure → permit suspension.
- Waymo Phoenix tow-truck collisions 2024: prediction of articulated/towed vehicles.
- Mobileye/REM, Zoox closed-loop testing — examples of safety case methodology.

# 7. Incident Investigation Checklist
1. Reconstruct timeline from sensor logs, perception traces, planner state, CAN bus, video.
2. Identify trigger event(s) and hazard manifestation.
3. Map to fault category (perception / prediction / planning / control / map / HMI / external).
4. Check ASIL/SOTIF coverage: was scenario in ODD? Was triggering condition foreseen?
5. Compliance: NHTSA SGO reportable? CA DMV disengagement filing? UN R157 DSSAD entry?
6. Recommend mitigations: software fix, ODD restriction, additional validation scenario, hardware change, operator coaching, fleet-wide OTA hold.

# 8. Compliance Citation Quick Reference
- ASIL D hazard control failure → ISO 26262-3 / -4 / -6.
- Perception misdetection of VRU under fog → ISO 21448 SOTIF Clause 7 (triggering conditions).
- Cyber intrusion via OTA → ISO/SAE 21434 + UN R155.
- ALKS over-speed or failed MRM → UN R157 §5.
- Failure to file crash report within 24h → NHTSA Standing General Order 2021-01.
- Disengagement not logged → CA CCR Title 13 §227.46.
- AEBS non-actuation → UN R152 / FMVSS 127.

=== END KNOWLEDGE BASE ===
`;
