import React from 'react';
import { Check, Shield, Swords, Zap } from 'lucide-react';
import { Faction } from '../../types';
import './FactionCard.css';

interface FactionCardProps {
  faction: Faction;
  isSelected: boolean;
  onSelect: (faction: Faction) => void;
  onPlayDrum: () => void;
}

const rarityNames: Record<Faction['rarity'], string> = {
  common: 'Phổ thông',
  rare: 'Hiếm',
  epic: 'Sử thi',
  legendary: 'Huyền thoại',
};

export const FactionCard: React.FC<FactionCardProps> = ({ faction, isSelected, onSelect, onPlayDrum }) => (
  <button
    type="button"
    className={`faction-card faction-art-${faction.faction_id} ${isSelected ? 'is-selected' : ''}`}
    aria-pressed={isSelected}
    onClick={() => { onPlayDrum(); onSelect(faction); }}
  >
    <div className="faction-card-art" aria-hidden="true" />
    <div className="faction-card-top"><span>{rarityNames[faction.rarity]}</span>{isSelected && <span className="faction-card-selected"><Check aria-hidden="true" /> Đang chọn</span>}</div>
    <div className="faction-card-body">
      <span className="faction-card-era">{faction.historical_era}</span>
      <h3>{faction.name}</h3>
      <p>{faction.special_unit}</p>
      <div className="faction-card-stats" aria-label="Chỉ số cộng thêm">
        <span title="Tấn công"><Swords aria-hidden="true" /> +{faction.attack_bonus ?? 0}%</span>
        <span title="Phòng thủ"><Shield aria-hidden="true" /> +{faction.defense_bonus ?? 0}%</span>
        <span title="Cơ động"><Zap aria-hidden="true" /> +{faction.movement_bonus ?? 0}%</span>
      </div>
    </div>
  </button>
);
