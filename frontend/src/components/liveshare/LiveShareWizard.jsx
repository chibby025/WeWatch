// frontend/src/components/liveshare/LiveShareWizard.jsx
// Unified LiveShare setup wizard with sliding steps

import { useState, useEffect } from 'react';
import { X, Check, ChevronRight, Video, Monitor, LayoutGrid, Settings, ChevronDown } from 'lucide-react';
import LiveShareModeSelector from './LiveShareModeSelector';
import LiveShareTypeSelector from './LiveShareTypeSelector';
import LiveShareLayoutSelector from '../cinema/ui/LiveShareLayoutSelector';

export default function LiveShareWizard({
  onComplete,
  onClose,
  isGuest = false,
  watchType,
  watchSessionMembers = [],
  currentUser,
  availableCameras = [], // 📹 NEW: Available camera devices
  selectedCameraId = null, // 📹 NEW: Currently selected camera
}) {
  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  
  // Selection state
  const [selectedMode, setSelectedMode] = useState(null);
  const [setupData, setSetupData] = useState(null);
  const [selectedShareType, setSelectedShareType] = useState(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState(selectedCameraId); // 📹 Initialize with current camera
  const [selectedLayout, setSelectedLayout] = useState(null);

  // Setup form state
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [setupTitle, setSetupTitle] = useState('');
  const [setupLogo, setSetupLogo] = useState(null);
  const [setupLogoPreview, setSetupLogoPreview] = useState(null);
  const [selectedGuest, setSelectedGuest] = useState(null); // ✅ Track selected guest
  
  // ✅ Styling state (lifted from SetupForm)
  const [titleColor, setTitleColor] = useState('#FFFFFF');
  const [titleSize, setTitleSize] = useState(24);
  const [titleWeight, setTitleWeight] = useState(700);
  const [titleCase, setTitleCase] = useState('none');
  const [logoSize, setLogoSize] = useState(100);
  const [logoX, setLogoX] = useState(10);
  const [logoY, setLogoY] = useState(80);
  
  // ✅ Mute All Members state (default to true for podcast/church/news/show modes)
  const [muteAllMembers, setMuteAllMembers] = useState(false);
  
  // ✅ Update muteAllMembers default when mode changes
  useEffect(() => {
    if (selectedMode) {
      // Default to enabled for podcast/church/news/show modes
      const shouldMuteByDefault = ['podcast', 'church', 'news', 'show'].includes(selectedMode);
      setMuteAllMembers(shouldMuteByDefault);
    }
  }, [selectedMode]);

  // Determine steps based on mode and user type
  const getSteps = () => {
    if (isGuest) {
      return [
        { id: 'type', name: 'Share Type', required: true },
        { id: 'layout', name: 'Layout', required: true },
      ];
    }

    const steps = [{ id: 'mode', name: 'Mode', required: true }];
    
    // Add setup step for podcast/church/news/show modes
    if (selectedMode && ['podcast', 'church', 'news', 'show'].includes(selectedMode)) {
      steps.push({ id: 'setup', name: 'Setup', required: true });
    }
    
    steps.push(
      { id: 'type', name: 'Share Type', required: true },
      { id: 'layout', name: 'Layout', required: true }
    );
    
    return steps;
  };

  const steps = getSteps();
  const totalSteps = steps.length;
  const currentStepData = steps[currentStep - 1];

  // Mark step as completed
  const markStepCompleted = (stepId) => {
    if (!completedSteps.includes(stepId)) {
      setCompletedSteps([...completedSteps, stepId]);
    }
  };

  // Navigation handlers
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    // ✅ If leaving setup step, save the setup data first
    if (currentStepData.id === 'setup') {
      const setupFormData = {
        title: setupTitle,
        logoFile: setupLogo,
        logoPreview: setupLogoPreview,
        guestId: selectedGuest?.id,
        titleStyle: {
          color: titleColor,
          size: titleSize,
          weight: titleWeight,
          case: titleCase
        },
        logoStyle: {
          size: logoSize,
          x: logoX,
          y: logoY
        },
      };
      console.log('📝 [LiveShareWizard] Saving setup data via handleNext:', setupFormData);
      setSetupData(setupFormData);
    }
    
    markStepCompleted(currentStepData.id);
    
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - complete wizard
      handleComplete();
    }
  };

  // Step-specific handlers
  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    markStepCompleted('mode');
    
    // If mode requires setup, show setup form (podcast, church, news, show)
    if (['podcast', 'church', 'news', 'show'].includes(mode)) {
      setShowSetupForm(true);
      setCurrentStep(2); // Move to setup
    } else {
      // Skip setup for regular mode
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSetupComplete = (data) => {
    console.log('📝 [LiveShareWizard] Setup complete with data:', {
      title: data.title,
      hasLogoFile: !!data.logoFile,
      logoFileName: data.logoFile?.name,
      guestId: data.guestId,
      titleStyle: data.titleStyle,
      logoStyle: data.logoStyle,
      fullData: data
    });
    setSetupData(data);
    markStepCompleted('setup');
    handleNext();
  };

  const handleTypeSelect = (type, deviceId) => {
    setSelectedShareType(type);
    setSelectedDeviceId(deviceId);
    markStepCompleted('type');
    handleNext();
  };

  const handleLayoutSelect = (layout) => {
    console.log('🎨 [LiveShareWizard] Layout selected:', layout);
    setSelectedLayout(layout);
    markStepCompleted('layout');
    handleComplete(layout); // ✅ Pass layout directly instead of relying on state
  };

  const handleComplete = (layoutOverride = null) => {
    const wizardData = {
      mode: selectedMode,
      setup: setupData,
      shareType: selectedShareType,
      deviceId: selectedDeviceId, // 📹 Selected camera ID
      cameraId: selectedDeviceId, // 📹 Explicit camera ID for clarity
      layout: layoutOverride || selectedLayout, // ✅ Use parameter if provided, else fall back to state
      muteAllMembers, // ✅ Mute all members flag
    };
    console.log('✅ [LiveShareWizard] Wizard completing with data:', {
      mode: wizardData.mode,
      hasSetupData: !!wizardData.setup,
      setupTitle: wizardData.setup?.title,
      setupHasLogoFile: !!wizardData.setup?.logoFile,
      setupGuestId: wizardData.setup?.guestId,
      setupTitleStyle: wizardData.setup?.titleStyle,
      setupLogoStyle: wizardData.setup?.logoStyle,
      shareType: wizardData.shareType,
      deviceId: wizardData.deviceId, // 📹 Log selected camera
      layout: wizardData.layout, // ✅ Log the layout value
      fullWizardData: wizardData
    });
    onComplete(wizardData);
    // ✅ Auto-close wizard after completion
    onClose();
  };

  // Check if current step can proceed
  const canProceed = () => {
    switch (currentStepData.id) {
      case 'mode':
        return !!selectedMode;
      case 'setup':
        return !!setupTitle.trim();
      case 'type':
        return !!selectedShareType;
      case 'layout':
        return !!selectedLayout;
      default:
        return false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-xl h-[95vh] border border-gray-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 bg-gray-900 rounded-t-2xl border-b border-gray-700 p-3 md:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-bold text-white">
                {isGuest ? 'Join LiveShare' : 'Start LiveShare'}
              </h2>
              <span className="text-xs text-gray-500">
                Step {currentStep}/{totalSteps}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Progress Indicator with Icons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5">
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCompleted = completedSteps.includes(step.id);
              const isCurrent = stepNumber === currentStep;
              
              // Icon mapping
              const iconMap = {
                mode: Video,
                setup: Settings,
                type: Monitor,
                layout: LayoutGrid
              };
              const StepIcon = iconMap[step.id] || Video;
              
              return (
                <div key={step.id} className="flex items-center flex-shrink-0">
                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className={`flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg border-2 transition-all ${
                        isCompleted
                          ? 'bg-green-500/20 border-green-400'
                          : isCurrent
                          ? 'bg-blue-500/20 border-blue-400'
                          : 'bg-gray-800/50 border-gray-700'
                      }`}
                    >
                      {isCompleted ? (
                        <Check size={16} className="text-green-400" strokeWidth={2.5} />
                      ) : (
                        <StepIcon size={16} className={isCurrent ? 'text-blue-400' : 'text-gray-500'} strokeWidth={2} />
                      )}
                    </div>
                    <span className={`text-[10px] md:text-xs font-medium whitespace-nowrap ${
                      isCompleted ? 'text-green-400' : isCurrent ? 'text-blue-400' : 'text-gray-600'
                    }`}>
                      {step.name}
                    </span>
                  </div>
                  
                  {index < steps.length - 1 && (
                    <ChevronRight size={14} className="text-gray-600 mx-0.5 md:mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content Area - Single Page View */}
        <div className="flex-1 flex flex-col p-3 md:p-4 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {/* Render only current step */}
          {currentStepData.id === 'mode' && (
            <LiveShareModeSelector
              onModeSelect={handleModeSelect}
              watchType={watchType}
              embedded={true}
            />
          )}
          
          {currentStepData.id === 'setup' && (
            <SetupForm
              mode={selectedMode}
              title={setupTitle}
              setTitle={setSetupTitle}
              logo={setupLogo}
              setLogo={setSetupLogo}
              logoPreview={setupLogoPreview}
              setLogoPreview={setSetupLogoPreview}
              selectedGuest={selectedGuest}
              setSelectedGuest={setSelectedGuest}
              watchSessionMembers={watchSessionMembers}
              currentUser={currentUser}
              onComplete={handleSetupComplete}
              titleColor={titleColor}
              setTitleColor={setTitleColor}
              titleSize={titleSize}
              setTitleSize={setTitleSize}
              titleWeight={titleWeight}
              setTitleWeight={setTitleWeight}
              titleCase={titleCase}
              setTitleCase={setTitleCase}
              logoSize={logoSize}
              setLogoSize={setLogoSize}
              logoX={logoX}
              setLogoX={setLogoX}
              logoY={logoY}
              setLogoY={setLogoY}
            />
          )}
          
          {currentStepData.id === 'type' && (
            <LiveShareTypeSelector
              onTypeSelect={handleTypeSelect}
              mode={selectedMode}
              isGuest={isGuest}
              embedded={true}
              hasGuestSelected={!!setupData?.guestId || !!selectedGuest}
              availableCameras={availableCameras} // 📹 Pass available cameras
              initialCameraId={selectedDeviceId} // 📹 Pass currently selected camera
            />
          )}
          
          {currentStepData.id === 'layout' && (
            <LiveShareLayoutSelector
              hasGuest={!!selectedGuest}
              hasScreenShare={selectedShareType === 'screen' || selectedShareType === 'both'}
              shareType={selectedShareType}
              mode={selectedMode}
              onSelectLayout={handleLayoutSelect}
              embedded={true}
              muteAllMembers={muteAllMembers}
              setMuteAllMembers={setMuteAllMembers}
            />
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex-shrink-0 bg-gray-900 border-t border-gray-700 p-4 md:p-5 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`px-4 md:px-6 py-2 text-sm md:text-base transition-colors ${
              currentStep === 1
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Back
          </button>
          
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className={`px-6 md:px-8 py-2 md:py-2.5 rounded-lg text-sm md:text-base font-medium transition-all ${
              canProceed()
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {currentStep === totalSteps ? 'Start Broadcasting' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Setup Form Component (for Podcast/News/Show modes)
function SetupForm({
  mode,
  title,
  setTitle,
  logo,
  setLogo,
  logoPreview,
  setLogoPreview,
  selectedGuest,
  setSelectedGuest,
  watchSessionMembers,
  currentUser,
  onComplete,
  // ✅ Styling props (lifted to wizard level)
  titleColor,
  setTitleColor,
  titleSize,
  setTitleSize,
  titleWeight,
  setTitleWeight,
  titleCase,
  setTitleCase,
  logoSize,
  setLogoSize,
  logoX,
  setLogoX,
  logoY,
  setLogoY,
}) {
  // Styling state
  const [showStyling, setShowStyling] = useState(false);

  const modeConfig = {
    podcast: { title: 'Podcast Setup', fieldLabel: 'Episode Title', guestLabel: 'Guest' },
    church: { title: 'Church Service Setup', fieldLabel: 'Church Name', guestLabel: 'Co-Pastor' },
    news: { title: 'News Setup', fieldLabel: 'Broadcast Title', guestLabel: 'Co-Anchor' },
    show: { title: 'Show Setup', fieldLabel: 'Show Title', guestLabel: 'Co-Host' },
  };

  const config = modeConfig[mode] || modeConfig.podcast;
  const eligibleGuests = watchSessionMembers.filter(m => m.id !== currentUser?.id);

  // Color presets
  const colorPresets = [
    { name: 'White', value: '#FFFFFF' },
    { name: 'Yellow', value: '#FBBF24' },
    { name: 'Gray', value: '#D1D5DB' },
    { name: 'Blue', value: '#60A5FA' },
    { name: 'Green', value: '#34D399' },
    { name: 'Red', value: '#F87171' },
  ];

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogo(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    onComplete({
      title,
      logoFile: logo, // ✅ Match expected property name
      logoPreview,
      guestId: selectedGuest?.id, // ✅ Match expected property name
      titleStyle: { // ✅ Match expected property name
        color: titleColor,
        size: titleSize,
        weight: titleWeight,
        case: titleCase,
      },
      logoStyle: { // ✅ Match expected property name
        size: logoSize,
        x: logoX,
        y: logoY,
      },
    });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h3 className="text-xl font-bold text-white mb-2">{config.title}</h3>
        <p className="text-gray-400 text-sm">Configure your broadcast details</p>
      </div>

      {/* Title Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {config.fieldLabel}
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`Enter ${config.fieldLabel.toLowerCase()}...`}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Logo (Optional)
        </label>
        <div className="flex items-center gap-4">
          {logoPreview && (
            <img src={logoPreview} alt="Logo preview" className="w-16 h-16 rounded-lg object-cover" />
          )}
          <button
            onClick={() => document.getElementById('logo-upload').click()}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-white text-sm transition-colors"
          >
            {logoPreview ? 'Change Logo' : 'Upload Logo'}
          </button>
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Guest Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {config.guestLabel} (Optional)
        </label>
        <select
          value={selectedGuest?.id || ''}
          onChange={(e) => {
            const guest = eligibleGuests.find(g => g.id === parseInt(e.target.value));
            setSelectedGuest(guest || null);
          }}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No guest</option>
          {eligibleGuests.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name || member.username || `User ${member.id}`}
            </option>
          ))}
        </select>
      </div>

      {/* Collapsible Styling Options */}
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700">
        <button
          onClick={() => setShowStyling(!showStyling)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/70 transition-colors"
        >
          <span className="text-sm font-medium text-gray-300">Advanced Styling (Optional)</span>
          <ChevronDown
            size={18}
            className={`text-gray-400 transition-transform duration-200 ${
              showStyling ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showStyling && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-700">
            {/* Color Picker */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Title Color</label>
              <div className="flex items-center gap-2 mb-2">
                {colorPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setTitleColor(preset.value)}
                    className={`w-8 h-8 rounded border-2 transition-all ${
                      titleColor === preset.value ? 'border-white scale-110' : 'border-gray-600'
                    }`}
                    style={{ backgroundColor: preset.value }}
                    title={preset.name}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={titleColor}
                  onChange={(e) => setTitleColor(e.target.value)}
                  className="w-12 h-8 rounded cursor-pointer bg-gray-700 border border-gray-600"
                />
                <input
                  type="text"
                  value={titleColor}
                  onChange={(e) => setTitleColor(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="#FFFFFF"
                />
              </div>
            </div>

            {/* Font Size Slider */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Title Size: {titleSize}px
              </label>
              <input
                type="range"
                min="16"
                max="48"
                step="2"
                value={titleSize}
                onChange={(e) => setTitleSize(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>16px</span>
                <span>48px</span>
              </div>
            </div>

            {/* Font Weight Dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Title Weight</label>
              <select
                value={titleWeight}
                onChange={(e) => setTitleWeight(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="300">Light (300)</option>
                <option value="400">Normal (400)</option>
                <option value="500">Medium (500)</option>
                <option value="700">Bold (700)</option>
                <option value="800">Extra Bold (800)</option>
              </select>
            </div>

            {/* Text Case Dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Text Case</label>
              <select
                value={titleCase}
                onChange={(e) => setTitleCase(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">As Typed</option>
                <option value="title">Title Case</option>
                <option value="upper">UPPERCASE</option>
                <option value="lower">lowercase</option>
                <option value="sentence">Sentence case</option>
              </select>
            </div>

            {/* Logo Styling (only if logo uploaded) */}
            {logoPreview && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Logo Size: {logoSize}px
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    step="10"
                    value={logoSize}
                    onChange={(e) => setLogoSize(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>50px</span>
                    <span>300px</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Logo X: {logoX}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="5"
                      value={logoX}
                      onChange={(e) => setLogoX(parseInt(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2">
                      Logo Y: {logoY}px
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="5"
                      value={logoY}
                      onChange={(e) => setLogoY(parseInt(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
