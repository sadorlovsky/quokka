import type { MafiaPlayerView } from "@/shared/types/mafia";
import { getRoleName, getTeamName } from "@/shared/types/mafia";
import { Timer } from "../../components/Timer";

interface RoleRevealProps {
	state: MafiaPlayerView;
}

export function RoleReveal({ state }: RoleRevealProps) {
	const isMafia = state.myTeam === "mafia";

	return (
		<div className="mafia-overlay mafia-overlay--role-reveal">
			<Timer endsAt={state.timerEndsAt} />
			<p className="mafia-overlay-subtitle">Ваша роль</p>
			<p className={`mafia-role-title mafia-role-title--${state.myTeam}`}>
				{getRoleName(state.myRole)}
			</p>
			<p className="mafia-team-label">Команда: {getTeamName(state.myTeam)}</p>

			{isMafia && state.mafiaMembers && (
				<div className="mafia-allies">
					<p className="mafia-allies-title">Ваши сообщники:</p>
					<ul className="mafia-allies-list">
						{state.mafiaMembers.map((id) => {
							const p = state.players.find((pl) => pl.id === id);
							if (!p) {
								return null;
							}
							return (
								<li key={id} className="mafia-allies-item">
									{p.name}
									{p.role && <span className="mafia-allies-role"> — {getRoleName(p.role)}</span>}
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</div>
	);
}
