import React from 'react';
import { CVAnalysis } from '../types';
import { Award, CheckCircle, AlertTriangle, Tag, User, FileText, ShieldAlert, Briefcase } from 'lucide-react';
import { clsx } from 'clsx';

interface ScoreDashboardProps {
  analysis: CVAnalysis;
}

// --- HELPER FUNCTIONS FOR SCORING LOGIC ---

// Updated Colors according to rules:
// 0–39 → terracotta (#E49B7A)
// 40–100 → gemengd / neutral darker / donkergroen (#1E3A35)
const getPercentageColor = (percent: number) => {
  if (percent < 40) return "#E49B7A";
  return "#1E3A35";
};

const getScoreInterpretation = (score: number) => {
  if (score < 40) return "Poor match";
  if (score < 60) return "Weak match";
  if (score < 80) return "Reasonable match";
  return "Strong match";
};

const formatScore = (val: any): string => {
  const num = Number(val);
  return isNaN(num) ? "0%" : `${Math.round(num)}%`;
};

// --- COMPONENTS ---

const DonutChart: React.FC<{ 
  score: number; 
  title: string; 
  size?: number 
}> = ({ score, title, size = 100 }) => {
  const strokeWidth = 6;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Accept score as 0-100 directly. 
  // Ensure it's clamped between 0 and 100.
  const percentage = Math.min(Math.max(score, 0), 100);
  
  const offset = circumference - (percentage / 100) * circumference;
  const color = getPercentageColor(percentage);
  const interpretation = getScoreInterpretation(percentage);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-2">
      <div className="relative flex items-center justify-center mb-3" style={{ width: size, height: size }}>
        {/* SVG Container */}
        <svg className="w-full h-full transform -rotate-90">
          {/* Background Track (Transparent/Light Grey) */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#e5e5e5"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        
        {/* Centered Score Text (Number Only) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={clsx("font-bold font-sans text-neutral-800", size < 75 ? "text-lg" : "text-2xl")}>
            {Math.round(percentage)}
          </span>
        </div>
      </div>
      
      {/* Title */}
      <span className="text-[10px] uppercase tracking-widest font-bold text-neutral-600 text-center mb-1 max-w-[120px] leading-tight">
        {title}
      </span>
      
      {/* Interpretation */}
      <span className="text-[9px] font-medium" style={{ color }}>
        {interpretation}
      </span>
    </div>
  );
};

export const ScoreDashboard: React.FC<ScoreDashboardProps> = ({ analysis }) => {
  if (!analysis?.scores) return null;

  const { scores, profile, tags, strengths, weaknesses, summary, extendedSummary, vacancyMatches, risks } = analysis;

  return (
    <div className="w-full h-full bg-white text-neutral-800 animate-fade-in">
      
      {/* Header Section */}
      <div className="bg-[#26392D] text-white p-8">
        <h2 className="font-serif text-3xl font-bold mb-2">Analysis Report</h2>
        <div className="flex flex-wrap gap-6 text-xs uppercase tracking-widest opacity-80">
           <div className="flex items-center gap-2"><Briefcase size={14} /> {profile.role || 'Unknown Role'}</div>
           <div className="flex items-center gap-2"><User size={14} /> {profile.seniority || 'Unknown Seniority'}</div>
           <div className="flex items-center gap-2"><Tag size={14} /> {profile.sector || 'General'}</div>
        </div>
      </div>

      <div className="p-8">
        {/* Top Scores Grid - 2 Rows x 3 Columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-8 gap-x-4 mb-12 border-b border-neutral-100 pb-12">
           
           {/* ROW 1 */}
           <div className="col-span-2 md:col-span-1 flex justify-center border-r border-transparent md:border-neutral-100">
             <DonutChart score={scores.overall} title="Overall Match" size={75} />
           </div>
           <div className="col-span-1 md:col-span-1 flex justify-center border-r border-transparent md:border-neutral-100">
             <DonutChart score={scores.relevance} title="Relevance" size={60} />
           </div>
           <div className="col-span-1 md:col-span-1 flex justify-center">
             <DonutChart score={scores.skillMatch} title="Skills" size={60} />
           </div>

           {/* ROW 2 */}
           <div className="col-span-1 md:col-span-1 flex justify-center border-r border-transparent md:border-neutral-100">
             <DonutChart score={scores.professional} title="Seniority" size={60} />
           </div>
           <div className="col-span-1 md:col-span-1 flex justify-center border-r border-transparent md:border-neutral-100">
             <DonutChart score={scores.consistency} title="Consistency" size={60} />
           </div>
           <div className="col-span-2 md:col-span-1 flex justify-center">
             <DonutChart score={scores.completeness} title="Quality" size={60} />
           </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
           
           {/* Left Column: Summary & Profile */}
           <div className="lg:col-span-2 space-y-8">
              
              {/* Executive Summary */}
              <div className="bg-neutral-50 p-6 border border-neutral-200 rounded-sm">
                 <h3 className="font-serif text-xl font-bold text-[#26392D] mb-4 flex items-center gap-2">
                   <FileText size={20} /> Executive Pitch
                 </h3>
                 <p className="text-sm leading-relaxed text-neutral-700 italic">
                   "{extendedSummary || summary}"
                 </p>
              </div>

              {/* Vacancy Matching (If Available) */}
              {vacancyMatches && vacancyMatches.length > 0 && (
                <div>
                   <h3 className="font-serif text-lg font-bold text-[#26392D] mb-4 flex items-center gap-2">
                     <Award size={18} /> Top Job Matches
                   </h3>
                   <div className="space-y-3">
                     {vacancyMatches.map((match, i) => (
                       <div key={i} className="flex items-center justify-between p-3 bg-white border border-neutral-200 shadow-sm">
                          <span className="font-bold text-sm text-[#26392D]">{match.title}</span>
                          <span 
                            className="font-bold text-sm px-3 py-1 rounded-full text-white"
                            style={{ backgroundColor: getPercentageColor(match.score) }}
                          >
                             {formatScore(match.score)}
                          </span>
                       </div>
                     ))}
                   </div>
                </div>
              )}

              {/* Strengths & Weaknesses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#26392D] mb-4 flex items-center gap-2">
                    <CheckCircle size={18} className="text-green-600" /> Strengths
                  </h3>
                  <ul className="space-y-2">
                    {strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                        <span className="block w-1.5 h-1.5 mt-1.5 bg-green-500 rounded-full flex-shrink-0"></span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#26392D] mb-4 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-500" /> Areas for Growth
                  </h3>
                  <ul className="space-y-2">
                    {weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                        <span className="block w-1.5 h-1.5 mt-1.5 bg-amber-500 rounded-full flex-shrink-0"></span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

           </div>

           {/* Right Column: Risks & Tags */}
           <div className="space-y-8">
              
              {/* Risk Analysis */}
              <div className="bg-red-50 p-6 border border-red-100 rounded-sm">
                <h3 className="font-serif text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                   <ShieldAlert size={18} /> Quality Checks
                </h3>
                {risks && risks.length > 0 ? (
                  <ul className="space-y-3">
                    {risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-red-800">
                        <span className="text-red-500 font-bold">•</span>
                        {risk}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-green-700 font-bold flex items-center gap-2">
                    <CheckCircle size={14} /> No major risks detected.
                  </p>
                )}
              </div>

              {/* Tags */}
              <div>
                 <h3 className="font-serif text-lg font-bold text-[#26392D] mb-4 flex items-center gap-2">
                   <Tag size={18} /> Skill Tags
                 </h3>
                 <div className="flex flex-wrap gap-2">
                    {tags.map((tag, i) => (
                      <span key={i} className="px-3 py-1 bg-neutral-100 text-neutral-600 text-[10px] uppercase tracking-wider font-bold rounded-sm border border-neutral-200">
                        {tag}
                      </span>
                    ))}
                 </div>
              </div>

           </div>
        </div>

      </div>
    </div>
  );
};