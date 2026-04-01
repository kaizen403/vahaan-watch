project(c_sample_02_basic)

add_executable(${PROJECT_NAME} 02_basic.c)
target_link_libraries(${PROJECT_NAME} carmenVideoSDK_c)
